import { create } from 'zustand'
import type { Upload as TusUpload } from 'tus-js-client'
import { createTusUpload } from './tusUpload'
import { supabase } from './supabase'
import { validateVideoFull, extractVideoThumbnail } from './imageOptimization'
import { logger } from './logger'

const BUCKET = 'user-posts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadStatus =
  | 'validating'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface VideoUploadResult {
  videoUrl: string
  thumbUrl: string | null
  width: number | null
  height: number | null
  duration: number | null
}

export interface UploadEntry {
  id: string
  fileName: string
  status: UploadStatus
  progress: number // 0-100
  error: string | null
  result: VideoUploadResult | null
  /** Internal — TUS instance for pause/resume/cancel */
  tusUpload: TusUpload | null
  /** Callback invoked on success (set by the dispatching component) */
  onComplete: ((result: VideoUploadResult) => void) | null
}

interface UploadManagerState {
  uploads: Record<string, UploadEntry>

  /** Kick off a video upload. Returns the upload ID. */
  startVideoUpload: (params: {
    file: File
    userId: string
    onComplete: (result: VideoUploadResult) => void
  }) => string

  cancelUpload: (uploadId: string) => void
  pauseUpload: (uploadId: string) => void
  resumeUpload: (uploadId: string) => void
  dismissUpload: (uploadId: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Translate raw storage/network errors into user-friendly messages */
function formatUploadError(raw: string): string {
  const lower = raw.toLowerCase()
  if (
    lower.includes('exceeded the maximum allowed size') ||
    lower.includes('maximum size exceeded') ||
    lower.includes('payload too large') ||
    lower.includes('content too large')
  )
    return 'This file is too large. Videos must be under 100 MB.'
  if (lower.includes('mime type') || lower.includes('content type') || lower.includes('not allowed'))
    return 'This file type is not supported. Use MP4, MOV, or WebM.'
  if (lower.includes('network error') || lower.includes('failed to fetch'))
    return 'Network error — please check your connection and try again.'
  if (lower.includes('bucket not found'))
    return 'Upload service is temporarily unavailable. Please try again later.'
  if (lower.includes('duplicate') || lower.includes('already exists'))
    return 'A file with this name already exists. Please try again.'
  return raw
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUploadManager = create<UploadManagerState>((set, get) => {
  // --- Internal: patch a single upload entry ---
  const updateUpload = (id: string, patch: Partial<UploadEntry>) => {
    set((state) => {
      const existing = state.uploads[id]
      if (!existing) return state
      return { uploads: { ...state.uploads, [id]: { ...existing, ...patch } } }
    })
  }

  // --- Visibility change: pause/resume TUS on tab hide/show ---
  let visibilityBound = false
  const bindVisibility = () => {
    if (visibilityBound || typeof document === 'undefined') return
    visibilityBound = true

    document.addEventListener('visibilitychange', () => {
      const { uploads } = get()
      for (const entry of Object.values(uploads)) {
        if (document.visibilityState === 'hidden' && entry.status === 'uploading' && entry.tusUpload) {
          // Pause without terminating server session (abort(false) keeps the TUS URL)
          entry.tusUpload.abort(false)
          updateUpload(entry.id, { status: 'paused' })
          logger.info('[UploadManager] Paused upload (tab hidden):', entry.id)
        } else if (document.visibilityState === 'visible' && entry.status === 'paused' && entry.tusUpload) {
          entry.tusUpload.start()
          updateUpload(entry.id, { status: 'uploading' })
          logger.info('[UploadManager] Resumed upload (tab visible):', entry.id)
        }
      }
    })
  }

  return {
    uploads: {},

    startVideoUpload: ({ file, userId, onComplete }) => {
      bindVisibility()

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      const entry: UploadEntry = {
        id,
        fileName: file.name,
        status: 'validating',
        progress: 0,
        error: null,
        result: null,
        tusUpload: null,
        onComplete,
      }

      set((state) => ({ uploads: { ...state.uploads, [id]: entry } }))

      // Fire-and-forget async pipeline
      ;(async () => {
        try {
          // Step 1: Validate
          const validation = await validateVideoFull(file)
          if (!validation.valid) {
            updateUpload(id, { status: 'error', error: validation.error || 'Invalid video' })
            return
          }
          if (get().uploads[id]?.status === 'cancelled') return

          updateUpload(id, { status: 'uploading', progress: 0 })

          // Step 2: Thumbnail + TUS video upload in parallel
          const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4'
          const random = Math.random().toString(36).slice(2, 8)
          const videoFileName = `${userId}/${Date.now()}_${random}.${ext}`

          // Thumbnail (best-effort, non-blocking)
          const thumbPromise = extractVideoThumbnail(file)
            .then(async (thumbFile) => {
              const thumbRandom = Math.random().toString(36).slice(2, 8)
              const thumbName = `${userId}/${Date.now()}_${thumbRandom}_poster.jpg`
              const { error: thumbErr } = await supabase.storage
                .from(BUCKET)
                .upload(thumbName, thumbFile, {
                  contentType: 'image/jpeg',
                  upsert: false,
                  cacheControl: '31536000',
                })
              if (thumbErr) {
                logger.warn('[UploadManager] Thumbnail upload failed (non-critical):', thumbErr)
                return null
              }
              const { data } = supabase.storage.from(BUCKET).getPublicUrl(thumbName)
              return data.publicUrl
            })
            .catch((err) => {
              logger.warn('[UploadManager] Thumbnail extraction failed (non-critical):', err)
              return null
            })

          // TUS video upload
          const videoPromise = new Promise<string>((resolve, reject) => {
            const tusUpload = createTusUpload({
              file,
              fileName: videoFileName,
              onProgress: (pct) => {
                updateUpload(id, { progress: Math.round(pct) })
              },
              onSuccess: (publicUrl) => {
                resolve(publicUrl)
              },
              onError: (error) => {
                reject(error)
              },
            })

            // Store the TUS reference for pause/resume/cancel
            updateUpload(id, { tusUpload })

            // Don't start if cancelled during validation
            if (get().uploads[id]?.status === 'cancelled') {
              reject(new Error('Cancelled'))
              return
            }

            tusUpload.start()
          })

          // Wait for both
          const [thumbUrl, videoUrl] = await Promise.all([thumbPromise, videoPromise])

          const result: VideoUploadResult = {
            videoUrl,
            thumbUrl,
            width: validation.width ?? null,
            height: validation.height ?? null,
            duration: validation.duration ?? null,
          }

          updateUpload(id, {
            status: 'completed',
            progress: 100,
            result,
            tusUpload: null,
          })

          // Fire the completion callback
          const currentEntry = get().uploads[id]
          currentEntry?.onComplete?.(result)
        } catch (err) {
          const currentEntry = get().uploads[id]
          if (currentEntry?.status === 'cancelled') return

          const message = err instanceof Error ? err.message : 'Upload failed'
          logger.error('[UploadManager] Upload pipeline error:', err)
          updateUpload(id, {
            status: 'error',
            error: formatUploadError(message),
            tusUpload: null,
          })
        }
      })()

      return id
    },

    cancelUpload: (uploadId) => {
      const entry = get().uploads[uploadId]
      if (!entry) return
      // abort(true) terminates server-side TUS session
      if (entry.tusUpload) {
        entry.tusUpload.abort(true)
      }
      updateUpload(uploadId, { status: 'cancelled', tusUpload: null })
    },

    pauseUpload: (uploadId) => {
      const entry = get().uploads[uploadId]
      if (!entry || entry.status !== 'uploading' || !entry.tusUpload) return
      entry.tusUpload.abort(false) // Pause without terminating
      updateUpload(uploadId, { status: 'paused' })
    },

    resumeUpload: (uploadId) => {
      const entry = get().uploads[uploadId]
      if (!entry || entry.status !== 'paused' || !entry.tusUpload) return
      entry.tusUpload.start()
      updateUpload(uploadId, { status: 'uploading' })
    },

    dismissUpload: (uploadId) => {
      set((state) => {
        const next = { ...state.uploads }
        delete next[uploadId]
        return { uploads: next }
      })
    },
  }
})
