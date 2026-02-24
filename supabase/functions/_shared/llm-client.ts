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

const SYSTEM_PROMPT = `You are a search assistant for PLAYR, a field hockey platform. Extract structured search filters from the user's natural language query.

IMPORTANT RULES:
- Only extract information explicitly stated or clearly implied in the query.
- For age: "U21" means max_age=20, "U18" means max_age=17, "U23" means max_age=22. "Senior" means min_age=21.
- For positions: use exactly "goalkeeper", "defender", "midfielder", or "forward" for players. Use "head coach", "assistant coach", or "youth coach" for coaches.
- For gender: use "Men" or "Women" exactly (capital first letter).
- "EU passport" means eu_passport=true. Do NOT list individual EU countries unless the user specifically names them.
- "Open to play", "available", or "looking for opportunities" means availability="open_to_play".
- "Verified references" or "references" maps to min_references.
- If role is not specified, infer from context: positions like "defender" imply role=["player"]; "head coach" implies role=["coach"]; "club" or "team" implies role=["club"]; "brand" or "sponsor" implies role=["brand"].
- For "playing in [country]" or "based in [country]", use the countries array for league/club country context, and locations for where they live.
- Always generate a human-readable summary field.
- Always call the search_profiles tool.`

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
    },
  },
}

// ─── Gemini (Google AI Studio — free tier) ────────────────────────────

async function callGemini(query: string): Promise<ParsedFilters> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY')
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY not configured')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: query }] }],
        tools: [{
          function_declarations: [{
            name: SEARCH_TOOL.name,
            description: SEARCH_TOOL.description,
            parameters: SEARCH_TOOL.input_schema,
          }],
        }],
        tool_config: {
          function_calling_config: { mode: 'ANY', allowed_function_names: ['search_profiles'] },
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

  // Find the function call part
  const fnCall = parts.find((p: any) => p.functionCall)
  if (!fnCall?.functionCall?.args) {
    throw new Error('Gemini did not produce a function call')
  }

  return fnCall.functionCall.args as ParsedFilters
}

// ─── Claude (Anthropic — paid) ────────────────────────────────────────

async function callClaude(query: string): Promise<ParsedFilters> {
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
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [{ name: SEARCH_TOOL.name, description: SEARCH_TOOL.description, input_schema: SEARCH_TOOL.input_schema }],
      tool_choice: { type: 'tool', name: 'search_profiles' },
      messages: [{ role: 'user', content: query }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Claude API error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const toolUse = data.content?.find((c: any) => c.type === 'tool_use')
  if (!toolUse?.input) throw new Error('Claude did not produce tool use')

  return toolUse.input as ParsedFilters
}

// ─── OpenAI (paid) ─────────────────────────────────────────────────────

async function callOpenAI(query: string): Promise<ParsedFilters> {
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
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      tools: [{
        type: 'function',
        function: { name: SEARCH_TOOL.name, description: SEARCH_TOOL.description, parameters: SEARCH_TOOL.input_schema },
      }],
      tool_choice: { type: 'function', function: { name: 'search_profiles' } },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
  if (!toolCall?.function?.arguments) throw new Error('OpenAI did not produce tool call')

  return JSON.parse(toolCall.function.arguments) as ParsedFilters
}

// ─── Provider dispatcher ───────────────────────────────────────────────

export async function parseSearchQuery(query: string): Promise<ParsedFilters> {
  const provider = Deno.env.get('LLM_PROVIDER') || 'gemini'

  switch (provider) {
    case 'gemini':  return callGemini(query)
    case 'claude':  return callClaude(query)
    case 'openai':  return callOpenAI(query)
    default:        return callGemini(query)
  }
}
