// deno-lint-ignore-file no-explicit-any
/**
 * LLM provider abstraction for natural language → structured filter parsing.
 *
 * Supports multiple providers via the LLM_PROVIDER env var:
 *   - 'gemini'  (default) — Google Gemini 2.5 Flash (free tier)
 *   - 'claude'  — Anthropic Claude Haiku (paid)
 *   - 'openai'  — OpenAI GPT-4o-mini (paid)
 *
 * Switching providers requires only changing the env var + API key.
 * Zero code changes needed.
 */

export interface ParsedFilters {
  roles?: string[]
  positions?: string[]
  gender?: string
  min_age?: number
  max_age?: number
  eu_passport?: boolean
  nationalities?: string[]
  locations?: string[]
  availability?: string
  min_references?: number
  min_career_entries?: number
  leagues?: string[]
  countries?: string[]
  text_query?: string
  sort_by?: string
  summary?: string
}

export interface SearchIntent {
  type: 'search'
  filters: ParsedFilters
  message: string
  include_qualitative?: boolean
}

export interface ConversationIntent {
  type: 'conversation'
  message: string
}

export type LLMResult = SearchIntent | ConversationIntent

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `You are PLAYR Assistant, a friendly AI for PLAYR — a field hockey platform connecting players, coaches, clubs, and brands.

You have two tools:
1. search_profiles — Use when the user wants to find or discover people/profiles. Extract structured filters from their query. Always include a conversational "message" field describing what you're looking for.
2. respond — Use for greetings, questions about PLAYR, help requests, or anything that is NOT a profile search. Be warm and helpful. Mention that you can help discover players, coaches, clubs, and brands.

FILTER EXTRACTION RULES (for search_profiles only):
- Only extract information explicitly stated or clearly implied in the query.
- For age: "U21" means max_age=20, "U18" means max_age=17, "U23" means max_age=22. "Senior" means min_age=21.
- For positions: use exactly "goalkeeper", "defender", "midfielder", or "forward" for players. Use "head coach", "assistant coach", or "youth coach" for coaches.
- For gender: use "Men" or "Women" exactly (capital first letter).
- "EU passport" means eu_passport=true. Do NOT list individual EU countries unless the user specifically names them.
- "Open to play", "available", or "looking for opportunities" means availability="open_to_play".
- "Verified references" or "references" maps to min_references.
- If role is not specified, infer from context: positions like "defender" imply role=["player"]; "head coach" implies role=["coach"]; "club" or "team" implies role=["club"]; "brand" or "sponsor" implies role=["brand"].
- For "playing in [country]" or "based in [country]", use the countries array for league/club country context, and locations for where they live.
- When the user mentions "good feedback", "strong references", "well-regarded", "reputation", "endorsed", "reviewed", "testimonials", "comments about", or any qualitative assessment, set include_qualitative=true. This triggers a deeper analysis of profile comments and endorsements for the top results.
- Always generate a human-readable summary field.

CONVERSATION CONTEXT:
When the user refers to previous results or modifies a previous search (e.g., "narrow that down", "show only defenders", "what about in England?"), interpret their request in context of the conversation history. Carry forward relevant filters from the previous search and apply the user's modifications.`

const SEARCH_TOOL = {
  name: 'search_profiles',
  description: 'Search PLAYR profiles with structured filters extracted from natural language.',
  input_schema: {
    type: 'object',
    properties: {
      roles: {
        type: 'array',
        items: { type: 'string', enum: ['player', 'coach', 'club', 'brand'] },
        description: 'Profile roles to search.',
      },
      positions: {
        type: 'array',
        items: { type: 'string', enum: ['goalkeeper', 'defender', 'midfielder', 'forward', 'head coach', 'assistant coach', 'youth coach'] },
        description: 'Playing positions or coaching roles to filter by.',
      },
      gender: {
        type: 'string',
        enum: ['Men', 'Women'],
        description: 'Gender filter. Only set if explicitly mentioned.',
      },
      min_age: { type: 'integer', description: 'Minimum age in years.' },
      max_age: { type: 'integer', description: 'Maximum age. U21=20, U18=17, U23=22.' },
      eu_passport: { type: 'boolean', description: 'True if user asks for EU passport holders.' },
      nationalities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Country names for nationality filter (e.g. ["Netherlands", "Argentina"]).',
      },
      locations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Country or city names for base location (e.g. ["UK", "London"]).',
      },
      availability: {
        type: 'string',
        enum: ['open_to_play', 'open_to_coach', 'open_to_opportunities'],
        description: 'Availability filter.',
      },
      min_references: { type: 'integer', description: 'Minimum number of accepted references.' },
      min_career_entries: { type: 'integer', description: 'Minimum career history entries.' },
      leagues: {
        type: 'array',
        items: { type: 'string' },
        description: 'League names (e.g. ["Premier Division", "Hoofdklasse"]).',
      },
      countries: {
        type: 'array',
        items: { type: 'string' },
        description: 'Country names where clubs/leagues are based (for "playing in X" queries).',
      },
      text_query: {
        type: 'string',
        description: 'Fallback free-text search for names or terms not covered by structured filters.',
      },
      sort_by: {
        type: 'string',
        enum: ['relevance', 'newest', 'most_referenced', 'recently_active'],
        description: 'Sort order. Default: relevance.',
      },
      summary: {
        type: 'string',
        description: 'Human-readable summary of the search, e.g. "Showing U21 female defenders with EU passport and 2+ references."',
      },
      message: {
        type: 'string',
        description: 'A conversational message about the search, e.g. "Here are the U21 female defenders I found for you!" Keep it to 1-2 sentences.',
      },
      include_qualitative: {
        type: 'boolean',
        description: 'Set to true when the user asks about reputation, feedback, references, endorsements, reviews, comments, or qualitative assessment of profiles.',
      },
    },
    required: ['message', 'summary'],
  },
}

const RESPOND_TOOL = {
  name: 'respond',
  description: 'Respond conversationally when the user is not searching for profiles. Use for greetings, questions about PLAYR, or anything that is not a profile search.',
  input_schema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'A friendly, helpful response to the user. Keep it concise (1-2 sentences).',
      },
    },
    required: ['message'],
  },
}

const DEFAULT_CONVERSATION_RESPONSE = "Hey! I'm PLAYR Assistant. I can help you discover players, coaches, clubs, and brands. Try asking something like 'Find U25 midfielders from the Netherlands'."

// ─── Gemini (Google AI Studio — free tier) ────────────────────────────

async function callGemini(query: string, history: HistoryTurn[] = []): Promise<LLMResult> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured')

  const contents = [
    ...history.map(turn => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: turn.content }],
    })),
    { role: 'user', parts: [{ text: query }] },
  ]

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        tools: [{
          function_declarations: [
            {
              name: SEARCH_TOOL.name,
              description: SEARCH_TOOL.description,
              parameters: SEARCH_TOOL.input_schema,
            },
            {
              name: RESPOND_TOOL.name,
              description: RESPOND_TOOL.description,
              parameters: RESPOND_TOOL.input_schema,
            },
          ],
        }],
        tool_config: {
          function_calling_config: { mode: 'ANY' },
        },
      }),
    }
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts

  if (!parts) throw new Error('Gemini returned no content')

  const fnCall = parts.find((p: any) => p.functionCall)
  if (!fnCall?.functionCall?.args) {
    throw new Error('Gemini did not produce a function call')
  }

  const { name, args } = fnCall.functionCall
  if (name === 'respond') {
    return { type: 'conversation', message: args.message || DEFAULT_CONVERSATION_RESPONSE }
  }

  const { message, include_qualitative, ...filters } = args
  return { type: 'search', filters: filters as ParsedFilters, message: message || filters.summary || '', include_qualitative: include_qualitative === true }
}

// ─── Claude (Anthropic — paid) ────────────────────────────────────────

async function callClaude(query: string, history: HistoryTurn[] = []): Promise<LLMResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const messages = [
    ...history.map(turn => ({ role: turn.role as 'user' | 'assistant', content: turn.content })),
    { role: 'user' as const, content: query },
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        { name: SEARCH_TOOL.name, description: SEARCH_TOOL.description, input_schema: SEARCH_TOOL.input_schema },
        { name: RESPOND_TOOL.name, description: RESPOND_TOOL.description, input_schema: RESPOND_TOOL.input_schema },
      ],
      tool_choice: { type: 'auto' },
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use')

  if (!toolUse?.input) {
    const textBlock = data.content?.find((c: any) => c.type === 'text')
    return { type: 'conversation', message: textBlock?.text || DEFAULT_CONVERSATION_RESPONSE }
  }

  if (toolUse.name === 'respond') {
    return { type: 'conversation', message: toolUse.input.message || DEFAULT_CONVERSATION_RESPONSE }
  }

  const { message, include_qualitative, ...filters } = toolUse.input
  return { type: 'search', filters: filters as ParsedFilters, message: message || filters.summary || '', include_qualitative: include_qualitative === true }
}

// ─── OpenAI (paid) ─────────────────────────────────────────────────────

async function callOpenAI(query: string, history: HistoryTurn[] = []): Promise<LLMResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    ...history.map(turn => ({ role: turn.role as 'user' | 'assistant', content: turn.content })),
    { role: 'user' as const, content: query },
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools: [
        { type: 'function', function: { name: SEARCH_TOOL.name, description: SEARCH_TOOL.description, parameters: SEARCH_TOOL.input_schema } },
        { type: 'function', function: { name: RESPOND_TOOL.name, description: RESPOND_TOOL.description, parameters: RESPOND_TOOL.input_schema } },
      ],
      tool_choice: 'auto',
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]

  if (!toolCall?.function) {
    const content = data.choices?.[0]?.message?.content
    return { type: 'conversation', message: content || DEFAULT_CONVERSATION_RESPONSE }
  }

  const args = JSON.parse(toolCall.function.arguments)
  if (toolCall.function.name === 'respond') {
    return { type: 'conversation', message: args.message || DEFAULT_CONVERSATION_RESPONSE }
  }

  const { message, include_qualitative, ...filters } = args
  return { type: 'search', filters: filters as ParsedFilters, message: message || filters.summary || '', include_qualitative: include_qualitative === true }
}

// ─── Provider dispatcher ───────────────────────────────────────────────

export async function parseSearchQuery(query: string, history: HistoryTurn[] = []): Promise<LLMResult> {
  const provider = Deno.env.get('LLM_PROVIDER') || 'gemini'

  switch (provider) {
    case 'gemini':  return callGemini(query, history)
    case 'claude':  return callClaude(query, history)
    case 'openai':  return callOpenAI(query, history)
    default:        return callGemini(query, history)
  }
}

// ─── Qualitative synthesis (second LLM pass) ─────────────────────────

export interface ProfileQualitativeData {
  profile_id: string
  full_name: string | null
  role: string
  position: string | null
  comments: Array<{
    content: string
    rating: string
    author_name: string | null
    author_role: string | null
  }>
  references: Array<{
    endorsement_text: string | null
    relationship_type: string
    endorser_name: string | null
    endorser_role: string | null
  }>
}

const SYNTHESIS_SYSTEM_PROMPT = `You are PLAYR Assistant analyzing reputation data for field hockey profiles. You will receive profile names with their comments and references. Synthesize this into a brief, helpful summary for someone evaluating these profiles.

RULES:
- Be concise: 1-2 sentences per profile, max.
- Focus on patterns: if multiple comments mention the same quality, highlight it.
- Distinguish between comments (public feedback from anyone) and references (trusted endorsements from connections).
- If a profile has no comments or references, say so briefly.
- Use a warm, professional tone. Do not fabricate or exaggerate.
- Do not use bullet points. Write flowing prose.
- Start with a brief intro like "Here's what the community says about these profiles:" then cover each person.`

function buildSynthesisUserMessage(profiles: ProfileQualitativeData[], userQuery: string): string {
  const sections = profiles.map(p => {
    const name = p.full_name || 'Unknown'
    const pos = p.position ? ` (${p.position})` : ''
    let section = `### ${name} — ${p.role}${pos}\n`

    if (p.comments.length > 0) {
      section += `Comments (${p.comments.length}):\n`
      section += p.comments.map(c =>
        `- [${c.rating}] "${c.content}" — ${c.author_name || 'Anonymous'} (${c.author_role || 'member'})`
      ).join('\n') + '\n'
    } else {
      section += 'No comments yet.\n'
    }

    if (p.references.length > 0) {
      section += `Trusted References (${p.references.length}):\n`
      section += p.references.map(r =>
        `- "${r.endorsement_text || '(no text)'}" — ${r.endorser_name || 'Anonymous'} (${r.endorser_role || 'member'}, ${r.relationship_type})`
      ).join('\n') + '\n'
    } else {
      section += 'No trusted references yet.\n'
    }

    return section
  }).join('\n')

  return `The user asked: "${userQuery}"\n\nReputation data for the top ${profiles.length} results:\n\n${sections}\n\nPlease synthesize these reputation signals concisely.`
}

async function synthesizeWithGemini(profiles: ProfileQualitativeData[], userQuery: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYNTHESIS_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildSynthesisUserMessage(profiles, userQuery) }] }],
      }),
    }
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Gemini synthesis error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function synthesizeWithClaude(profiles: ProfileQualitativeData[], userQuery: string): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildSynthesisUserMessage(profiles, userQuery) }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude synthesis error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find((c: any) => c.type === 'text')
  return textBlock?.text || ''
}

async function synthesizeWithOpenAI(profiles: ProfileQualitativeData[], userQuery: string): Promise<string> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 512,
      messages: [
        { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
        { role: 'user', content: buildSynthesisUserMessage(profiles, userQuery) },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI synthesis error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function synthesizeQualitativeInsights(
  profiles: ProfileQualitativeData[],
  userQuery: string
): Promise<string> {
  const provider = Deno.env.get('LLM_PROVIDER') || 'gemini'

  switch (provider) {
    case 'gemini':  return synthesizeWithGemini(profiles, userQuery)
    case 'claude':  return synthesizeWithClaude(profiles, userQuery)
    case 'openai':  return synthesizeWithOpenAI(profiles, userQuery)
    default:        return synthesizeWithGemini(profiles, userQuery)
  }
}
