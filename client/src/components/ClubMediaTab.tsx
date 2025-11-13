import { useState, useEffect, useRef, useCallback } from 'react'
import { Upload, Trash2, GripVertical, Edit2, X, Check, ArrowUp, ArrowDown, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import type { ClubMedia } from '@/lib/supabase'
import ConfirmActionModal from './ConfirmActionModal'
import MediaLightbox from './MediaLightbox'
import Skeleton from './Skeleton'

interface ClubMediaTabProps {
  clubId?: string
  readOnly?: boolean
}

interface UploadProgress {
  file: File
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}

export default function ClubMediaTab({ clubId, readOnly = false }: ClubMediaTabProps) {
  const { user } = useAuthStore()
  const targetClubId = clubId || user?.id
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToastStore()
  
  const [media, setMedia] = useState<ClubMedia[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
  const [draggedItem, setDraggedItem] = useState<ClubMedia | null>(null)
  const [editingCaption, setEditingCaption] = useState<string | null>(null)
  const [captionText, setCaptionText] = useState('')
  const [altText, setAltText] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ClubMedia | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previewMedia, setPreviewMedia] = useState<ClubMedia | null>(null)
  const [isUploadDragActive, setIsUploadDragActive] = useState(false)
  const [savingCaptionId, setSavingCaptionId] = useState<string | null>(null)

  // Fetch club media
  const fetchMedia = useCallback(async () => {
    if (!targetClubId) return
    
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('club_media')
        .select('*')
        .eq('club_id', targetClubId)
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) throw error
      setMedia(data || [])
    } catch (error) {
      console.error('Error fetching club media:', error)
    } finally {
      setIsLoading(false)
    }
  }, [targetClubId])

  useEffect(() => {
    if (targetClubId) {
      fetchMedia()
    }
  }, [targetClubId, fetchMedia])

  // Validate file
  const validateFile = (file: File): string | null => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return 'Only JPG, PNG, and WebP images are allowed'
    }
    
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return 'File size must be less than 10MB'
    }
    
    return null
  }

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return

    const fileArray = Array.from(files).slice(0, 10) // Max 10 files
    const validFiles: File[] = []
    
    // Validate all files first
    for (const file of fileArray) {
      const error = validateFile(file)
      if (error) {
        addToast(`${file.name}: ${error}`, 'error')
        continue
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    // Initialize progress tracking
    const progressItems: UploadProgress[] = validFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading'
    }))
    setUploadProgress(progressItems)

    // Upload files
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      try {
        // Create unique filename
        const fileExt = file.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('club-media')
          .upload(fileName, file)

        if (uploadError) throw uploadError

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('club-media')
          .getPublicUrl(fileName)

        // Get the highest order_index
        const maxOrder = media.length > 0 
          ? Math.max(...media.map(m => m.order_index))
          : -1

        // Save to database
        const { error: dbError } = await supabase
          .from('club_media')
          .insert({
            club_id: user.id,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
            order_index: maxOrder + 1
          })

        if (dbError) throw dbError

        // Update progress
        setUploadProgress(prev => 
          prev.map((item, idx) => 
            idx === i ? { ...item, progress: 100, status: 'success' } : item
          )
        )
      } catch (error) {
        console.error('Error uploading file:', error)
        setUploadProgress(prev => 
          prev.map((item, idx) => 
            idx === i 
              ? { ...item, status: 'error', error: 'Upload failed' } 
              : item
          )
        )
      }
    }

    // Refresh media list after all uploads
    await fetchMedia()
    
    // Clear progress after 2 seconds
    setTimeout(() => {
      setUploadProgress([])
    }, 2000)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const requestDelete = (mediaItem: ClubMedia) => {
    setPendingDelete(mediaItem)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return

    setDeletingId(pendingDelete.id)
    try {
      const urlParts = pendingDelete.file_url.split('/club-media/')
      if (urlParts.length < 2) throw new Error('Invalid file URL')
      const filePath = urlParts[1]

      const { error: storageError } = await supabase.storage
        .from('club-media')
        .remove([filePath])

      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from('club_media')
        .delete()
        .eq('id', pendingDelete.id)

      if (dbError) throw dbError

      await fetchMedia()
      addToast('Photo removed from gallery.', 'success')
      setPendingDelete(null)
    } catch (error) {
      console.error('Error deleting media:', error)
      addToast('Failed to delete photo. Please try again.', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, item: ClubMedia) => {
    setDraggedItem(item)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleReorderDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const persistOrder = async (updatedList: ClubMedia[]) => {
    const normalized = updatedList.map((item, index) => ({
      ...item,
      order_index: index
    }))

    setMedia(normalized)

    try {
      await Promise.all(
        normalized.map(item =>
          supabase
            .from('club_media')
            .update({ order_index: item.order_index })
            .eq('id', item.id)
        )
      )
    } catch (error) {
      console.error('Error updating order:', error)
      await fetchMedia()
    }
  }

  const handleDrop = (e: React.DragEvent, targetItem: ClubMedia) => {
    e.preventDefault()

    if (!draggedItem || draggedItem.id === targetItem.id) {
      setDraggedItem(null)
      return
    }

    const reorderedMedia = [...media]
    const draggedIndex = reorderedMedia.findIndex(m => m.id === draggedItem.id)
    const targetIndex = reorderedMedia.findIndex(m => m.id === targetItem.id)

    const [removed] = reorderedMedia.splice(draggedIndex, 1)
    reorderedMedia.splice(targetIndex, 0, removed)

    setDraggedItem(null)
    void persistOrder(reorderedMedia)
  }

  const moveMedia = (itemId: string, direction: 'up' | 'down') => {
    const currentIndex = media.findIndex(item => item.id === itemId)
    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= media.length) return

    const reordered = [...media]
    const [item] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, item)

    void persistOrder(reordered)
  }

  // Handle caption edit
  const startEditingCaption = (item: ClubMedia) => {
    setEditingCaption(item.id)
    setCaptionText(item.caption || '')
    setAltText(item.alt_text || '')
  }

  const saveCaption = async (itemId: string) => {
    setSavingCaptionId(itemId)
    try {
      const { error } = await supabase
        .from('club_media')
        .update({ 
          caption: captionText.trim() || null,
          alt_text: altText.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)

      if (error) throw error

      setEditingCaption(null)
      await fetchMedia()
    } catch (error) {
      console.error('Error updating caption:', error)
      addToast('Failed to update caption. Please try again.', 'error')
    } finally {
      setSavingCaptionId(null)
    }
  }

  const cancelEdit = () => {
    setEditingCaption(null)
    setCaptionText('')
    setAltText('')
  }

  // Handle drag and drop zone
  const handleUploadDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsUploadDragActive(true)
  }

  const handleUploadDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) {
      return
    }
    setIsUploadDragActive(false)
  }

  const handleUploadDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setIsUploadDragActive(true)
  }

  const handleUploadDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsUploadDragActive(false)
    
    const files = e.dataTransfer.files
    handleFileUpload(files)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {!readOnly && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Photo Gallery</h2>
            <p className="mt-1 text-gray-600 sm:mt-0 sm:text-sm">
              Upload and manage your club photos
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
            type="button"
          >
            <Upload className="h-5 w-5" />
            Add Photos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
            aria-label="Upload photos"
          />
        </div>
      )}

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="space-y-2">
          {uploadProgress.map((item, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 truncate flex-1">
                  {item.file.name}
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  {item.status === 'success' ? '✓' : item.status === 'error' ? '✗' : `${item.progress}%`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <progress
                  value={item.progress}
                  max={100}
                  className={`progress-bar h-2 w-full rounded-full ${
                    item.status === 'success' ? 'text-green-500' :
                    item.status === 'error' ? 'text-red-500' : 'text-blue-500'
                  }`}
                />
              </div>
              {item.error && (
                <p className="text-sm text-red-600 mt-1">{item.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Drag & Drop Upload Zone */}
      {!readOnly && media.length === 0 && !isLoading && (
        <div
          onDragEnter={handleUploadDragEnter}
          onDragOver={handleUploadDragOver}
          onDragLeave={handleUploadDragLeave}
          onDrop={handleUploadDrop}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            isUploadDragActive
              ? 'border-[#8b5cf6] bg-[#f5f3ff]'
              : 'border-gray-300 hover:border-[#8b5cf6]'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          role="button"
          tabIndex={0}
        >
          <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="mb-1 font-medium text-gray-600">
            Drag and drop photos here, or click to browse
          </p>
          <p className="text-sm text-gray-500">
            JPG, PNG, or WebP • Max 10MB per file • Up to 10 files at once
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[3/4] w-full" variant="rectangular" />
          ))}
        </div>
      )}

      {/* Photo Grid */}
      {!isLoading && media.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item, index) => (
            <div
              key={item.id}
              draggable={!readOnly}
              onDragStart={(e) => handleDragStart(e, item)}
              onDragOver={handleReorderDragOver}
              onDrop={(e) => handleDrop(e, item)}
              className={`group rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg ${
                !readOnly ? 'cursor-move active:cursor-grabbing' : ''
              }`}
            >
              {/* Image */}
              <div
                className="relative aspect-[3/4] overflow-hidden bg-gray-100"
                role="button"
                tabIndex={0}
                onClick={() => setPreviewMedia(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setPreviewMedia(item)
                  }
                }}
              >
                <img
                  src={item.file_url}
                  alt={item.alt_text || item.file_name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                {!readOnly && (
                  <div className="pointer-events-none absolute left-2 top-2 rounded-lg bg-white/80 p-2 shadow-lg backdrop-blur">
                    <GripVertical className="w-4 h-4 text-gray-600" />
                  </div>
                )}
                {!readOnly && (
                  <button
                    data-block-preview
                    onClick={(event) => {
                      event.stopPropagation()
                      requestDelete(item)
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    disabled={deletingId === item.id}
                    className="absolute right-2 top-2 rounded-lg bg-red-500 p-2 text-white shadow-lg transition-colors hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete photo"
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Details */}
              <div className="p-4 space-y-2">
                {editingCaption === item.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={captionText}
                      onChange={(e) => setCaptionText(e.target.value.slice(0, 200))}
                      placeholder="Caption (optional, max 200 chars)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <input
                      type="text"
                      value={altText}
                      onChange={(e) => setAltText(e.target.value)}
                      placeholder="Alt text for accessibility (optional)"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <button
                        onClick={() => saveCaption(item.id)}
                        className="flex-1 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-green-400 sm:flex-none sm:min-w-[120px]"
                        disabled={savingCaptionId === item.id}
                        type="button"
                      >
                        {savingCaptionId === item.id ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving…
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1">
                            <Check className="h-4 w-4" />
                            Save
                          </span>
                        )}
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex-1 rounded-lg border border-[#8b5cf6] px-3 py-2 text-sm font-medium text-[#8b5cf6] transition-colors hover:bg-[#f5f3ff] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:min-w-[120px]"
                        disabled={savingCaptionId === item.id}
                        type="button"
                      >
                        <span className="flex items-center justify-center gap-1">
                          <X className="h-4 w-4" />
                          Cancel
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {!readOnly && (
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white">
                          <button
                            onClick={() => moveMedia(item.id, 'up')}
                            className="px-2 py-1 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                            disabled={index === 0}
                            type="button"
                          >
                            <ArrowUp className="h-4 w-4" />
                            <span className="sr-only">Move photo earlier</span>
                          </button>
                          <button
                            onClick={() => moveMedia(item.id, 'down')}
                            className="px-2 py-1 text-gray-500 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                            disabled={index === media.length - 1}
                            type="button"
                          >
                            <ArrowDown className="h-4 w-4" />
                            <span className="sr-only">Move photo later</span>
                          </button>
                        </div>
                        <button
                          onClick={() => startEditingCaption(item)}
                          className="p-1 text-gray-400 transition-colors hover:text-purple-600"
                          title="Edit caption"
                          type="button"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {item.caption && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {item.caption}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      Uploaded {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleUploadDragEnter}
              onDragOver={handleUploadDragOver}
              onDragLeave={handleUploadDragLeave}
              onDrop={handleUploadDrop}
              className={`flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors ${
                isUploadDragActive
                  ? 'border-[#8b5cf6] bg-[#f5f3ff] text-[#8b5cf6]'
                  : 'border-gray-300 text-gray-500 hover:border-[#8b5cf6]'
              }`}
            >
              <Upload className="h-8 w-8" />
              <span className="text-sm font-medium">Add more photos</span>
              <span className="text-xs text-gray-400">
                Drag files here or tap to browse
              </span>
            </button>
          )}
        </div>
      )}

      {/* Empty State (when not loading and has media) */}
      {!isLoading && media.length === 0 && readOnly && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600">No photos yet</p>
        </div>
      )}

      <ConfirmActionModal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        confirmLabel="Delete Photo"
        confirmTone="danger"
        confirmLoading={Boolean(deletingId)}
        loadingLabel="Deleting..."
        title="Remove photo from gallery?"
        description="This will permanently delete the image from your club media gallery."
        icon={<Trash2 className="h-6 w-6" />}
        body={pendingDelete ? (
          <div className="space-y-3 text-sm text-gray-600">
            <p>Deleting this media will also remove it from any public club marketing pages.</p>
            <img
              src={pendingDelete.file_url}
              alt={pendingDelete.alt_text || pendingDelete.file_name}
              className="h-48 w-full rounded-lg object-cover"
              loading="lazy"
            />
          </div>
        ) : undefined}
      />

      <MediaLightbox
        media={previewMedia ? {
          id: previewMedia.id,
          url: previewMedia.file_url,
          alt: previewMedia.alt_text || previewMedia.file_name
        } : null}
        onClose={() => setPreviewMedia(null)}
      />
    </div>
  )
}
