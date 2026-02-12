import { Upload } from 'tus-js-client'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase'
import { logger } from './logger'

const BUCKET = 'user-posts'
const TUS_CHUNK_SIZE = 6 * 1024 * 1024 // 6 MB — Supabase default

interface TusUploadOptions {
  file: File
  fileName: string // e.g. "userId/1234567890_abc123.mp4"
  onProgress: (pct: number) => void
  onSuccess: (publicUrl: string) => void
  onError: (error: Error) => void
}

/**
 * Creates a TUS resumable upload configured for Supabase Storage.
 * Returns a tus-js-client Upload instance — call `.start()` to begin.
 */
export function createTusUpload(options: TusUploadOptions): Upload {
  const { file, fileName, onProgress, onSuccess, onError } = options
  const endpoint = `${SUPABASE_URL}/storage/v1/upload/resumable`

  const upload = new Upload(file, {
    endpoint,
    retryDelays: [0, 1000, 3000, 5000],
    chunkSize: TUS_CHUNK_SIZE,
    metadata: {
      bucketName: BUCKET,
      objectName: fileName,
      contentType: file.type,
      cacheControl: '31536000',
    },
    headers: {
      apikey: SUPABASE_ANON_KEY,
    },
    onBeforeRequest: async (req) => {
      // Refresh auth token before each chunk to handle long uploads
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || SUPABASE_ANON_KEY
      req.setHeader('Authorization', `Bearer ${token}`)
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      const pct = (bytesUploaded / bytesTotal) * 100
      onProgress(pct)
    },
    onSuccess: () => {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${fileName}`
      onSuccess(publicUrl)
    },
    onError: (error) => {
      logger.error('[TUS] Upload error:', error)
      onError(error instanceof Error ? error : new Error(String(error)))
    },
  })

  return upload
}
