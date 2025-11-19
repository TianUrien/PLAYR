// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface DeleteAccountResponse {
  success: boolean
  error?: string
  correlationId?: string
  durationMs?: number
  status?: 'complete' | 'partial'
  warnings?: string[]
  deletedData?: {
    profiles: number
    messages: number
    archivedMessages?: number
    conversations: number
    applications: number
    playerMedia: number
    opportunityInboxState?: number
    clubMedia: number
    playingHistory: number
    vacancies: number
    storageFiles: number
    notifications?: number
    friendships?: number
    unreadCounters?: number
    references?: number
  }
}

type LogMeta = Record<string, unknown>

type SupabaseServerClient = SupabaseClient<any, any, any>

type StorageTarget = {
  bucket: string
  prefix: string
  label: string
}

const STORAGE_BUCKETS = ['avatars', 'gallery', 'club-media', 'player-media', 'journey'] as const
const STORAGE_PAGE_SIZE = 100
const DB_BATCH_SIZE = 2000
const DELETE_RELATIONS_FUNCTION = 'hard_delete_profile_relations'

const createLogger = (correlationId: string) => ({
  info: (message: string, meta?: LogMeta) => console.log(`[DELETE_ACCOUNT][${correlationId}] ${message}`, meta ?? ''),
  warn: (message: string, meta?: LogMeta) => console.warn(`[DELETE_ACCOUNT][${correlationId}] ${message}`, meta ?? ''),
  error: (message: string, meta?: LogMeta) => console.error(`[DELETE_ACCOUNT][${correlationId}] ${message}`, meta ?? ''),
})

const sanitizeBearerToken = (authHeader: string | null): string => {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new Error('Missing authorization header')
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    throw new Error('Invalid authorization token')
  }

  return token
}

const normalizePrefix = (prefix: string): string => prefix.replace(/^\/+/, '').replace(/\/+$/, '')

const getStorageTargets = (userId: string): StorageTarget[] =>
  STORAGE_BUCKETS.map((bucket) => ({
    bucket,
    prefix: userId,
    label: bucket,
  }))

const deleteStoragePrefix = async (client: SupabaseServerClient, target: StorageTarget): Promise<number> => {
  const normalizedPrefix = normalizePrefix(target.prefix)
  if (!normalizedPrefix) {
    return 0
  }

  const objectsToDelete: string[] = []

  const collectObjects = async (path: string) => {
    let offset = 0

    while (true) {
      const { data, error } = await client.storage.from(target.bucket).list(path, {
        limit: STORAGE_PAGE_SIZE,
        offset,
      })

      if (error) {
        if (isMissingStorageFolder(error)) {
          return
        }
        throw error
      }

      if (!data || data.length === 0) {
        break
      }

      for (const entry of data) {
        const nextPath = path ? `${path}/${entry.name}` : entry.name
        if ((entry as { id?: string | null }).id) {
          objectsToDelete.push(nextPath)
        } else {
          await collectObjects(nextPath)
        }
      }

      if (data.length < STORAGE_PAGE_SIZE) {
        break
      }

      offset += STORAGE_PAGE_SIZE
    }
  }

  await collectObjects(normalizedPrefix)

  if (objectsToDelete.length === 0) {
    return 0
  }

  let removed = 0
  for (let index = 0; index < objectsToDelete.length; index += STORAGE_PAGE_SIZE) {
    const chunk = objectsToDelete.slice(index, index + STORAGE_PAGE_SIZE)
    const { error: removeError } = await client.storage.from(target.bucket).remove(chunk)
    if (removeError) {
      throw removeError
    }
    removed += chunk.length
  }

  return removed
}

const isMissingStorageFolder = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as { message?: string; statusCode?: number | string }
  if (maybeError.statusCode === 404 || maybeError.statusCode === '404') {
    return true
  }

  return Boolean(maybeError.message?.toLowerCase().includes('not found'))
}

const applyDeletionSummary = (
  deletedData: NonNullable<DeleteAccountResponse['deletedData']>,
  summary?: Record<string, number | null>
) => {
  if (!summary) {
    return
  }

  const pick = (key: string): number => Number(summary[key] ?? 0)

  deletedData.applications = pick('applications')
  deletedData.vacancies = pick('vacancies')
  deletedData.playingHistory = pick('playingHistory')
  deletedData.playerMedia = pick('galleryPhotos')
  deletedData.clubMedia = pick('clubMedia')
  deletedData.messages = pick('messages')
  deletedData.conversations = pick('conversations')
  deletedData.profiles = pick('profiles')

  const archived = pick('archivedMessages')
  if (archived > 0) {
    deletedData.archivedMessages = archived
  }

  const notifications = pick('profileNotifications')
  if (notifications > 0) {
    deletedData.notifications = notifications
  }

  const friendships = pick('friendships')
  if (friendships > 0) {
    deletedData.friendships = friendships
  }

  const references = pick('profileReferences')
  if (references > 0) {
    deletedData.references = references
  }

  const unreadCounters = pick('unreadCounters')
  if (unreadCounters > 0) {
    deletedData.unreadCounters = unreadCounters
  }

  const opportunityInboxState = pick('opportunityInboxState')
  if (opportunityInboxState > 0) {
    deletedData.opportunityInboxState = opportunityInboxState
  }
}

const enqueueStorageCleanupFallback = async (
  client: SupabaseServerClient,
  bucket: string,
  prefix: string,
  logger: ReturnType<typeof createLogger>
) => {
  try {
    const { data, error } = await client.rpc('enqueue_storage_objects_for_prefix', {
      p_bucket: bucket,
      p_prefix: prefix,
      p_reason: 'delete_account_fallback'
    })

    if (error) {
      throw error
    }

    return Number(data ?? 0)
  } catch (error) {
    logger.warn('Failed to enqueue storage cleanup fallback', { bucket, prefix, error })
    return 0
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      headers: corsHeaders,
      status: 405,
    })
  }

  const correlationId = crypto.randomUUID()
  const logger = createLogger(correlationId)
  const startedAt = performance.now()

  try {
    const token = sanitizeBearerToken(req.headers.get('Authorization'))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase credentials are not configured')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      throw new Error('Invalid or expired token')
    }

    logger.info('Beginning account deletion', { userId: user.id })

    const deletedData: NonNullable<DeleteAccountResponse['deletedData']> = {
      profiles: 0,
      messages: 0,
      conversations: 0,
      applications: 0,
      playerMedia: 0,
      clubMedia: 0,
      playingHistory: 0,
      vacancies: 0,
      storageFiles: 0,
    }

    const warnings: string[] = []

    for (const target of getStorageTargets(user.id)) {
      try {
        const removed = await deleteStoragePrefix(supabase, target)
        if (removed > 0) {
          deletedData.storageFiles += removed
          logger.info('Removed storage files', { bucket: target.bucket, removed })
        }
      } catch (storageError) {
        logger.warn('Storage cleanup failed', { bucket: target.bucket, error: storageError })
        const normalizedPrefix = normalizePrefix(target.prefix)
        const queued = await enqueueStorageCleanupFallback(supabase, target.bucket, normalizedPrefix, logger)
        if (queued > 0) {
          warnings.push(`Queued ${queued} ${target.bucket}/${normalizedPrefix} objects for async cleanup`)
        } else {
          warnings.push(`Failed to purge ${target.bucket}/${target.prefix}`)
        }
      }
    }

    try {
      const { data, error } = await supabase.rpc(DELETE_RELATIONS_FUNCTION, {
        p_user_id: user.id,
        p_batch: DB_BATCH_SIZE,
      })

      if (error) {
        throw error
      }

      applyDeletionSummary(deletedData, data ?? undefined)
      logger.info('Relational cleanup complete', { counts: data })
    } catch (dbError) {
      logger.error('Database cleanup failed', { error: dbError })
      throw new Error('Failed to delete profile data')
    }

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteUserError) {
      logger.error('Auth deletion failed', { error: deleteUserError })
      throw new Error('Failed to delete auth user')
    }

    const durationMs = Math.round(performance.now() - startedAt)
    logger.info('Account deletion completed', { durationMs, warnings })

    const success = warnings.length === 0

    const response: DeleteAccountResponse = {
      success,
      correlationId,
      durationMs,
      status: success ? 'complete' : 'partial',
      warnings: warnings.length ? warnings : undefined,
      deletedData,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      status: 200,
    })
  } catch (error: any) {
    logger.error('Delete-account error', { error })

    const response: DeleteAccountResponse = {
      success: false,
      error: error?.message || 'An unexpected error occurred',
      correlationId,
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      status: 400,
    })
  }
})
