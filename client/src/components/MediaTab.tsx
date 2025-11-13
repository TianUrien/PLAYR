import { useState, useEffect, useCallback } from 'react'
import { Video, Plus, Upload, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import type { GalleryPhoto, Profile } from '@/lib/supabase'
import Button from './Button'
import AddVideoLinkModal from './AddVideoLinkModal'
import { optimizeImage, validateImage } from '@/lib/imageOptimization'
import { logger } from '@/lib/logger'
import { invalidateProfile } from '@/lib/profile'
import { useToastStore } from '@/lib/toast'
import ConfirmActionModal from './ConfirmActionModal'
import MediaLightbox from './MediaLightbox'
import Skeleton from './Skeleton'

interface MediaTabProps {
  profileId?: string
  readOnly?: boolean
}

export default function MediaTab({ profileId, readOnly = false }: MediaTabProps) {
  const { user, profile: authProfile } = useAuthStore()
  const targetUserId = profileId || user?.id
  const { addToast } = useToastStore()
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [targetProfile, setTargetProfile] = useState<Profile | null>(null)
  const [showAddVideoModal, setShowAddVideoModal] = useState(false)
  const [galleryPhotos, setGalleryPhotos] = useState<GalleryPhoto[]>([])
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [deletingVideo, setDeletingVideo] = useState(false)
  const [photoPendingDelete, setPhotoPendingDelete] = useState<GalleryPhoto | null>(null)
  const [showVideoDeleteModal, setShowVideoDeleteModal] = useState(false)
  const [previewPhoto, setPreviewPhoto] = useState<GalleryPhoto | null>(null)

  // Use the target profile if viewing someone else, otherwise use auth profile
  const displayProfile = targetProfile || authProfile
  const isPlayerProfile = displayProfile?.role === 'player'

  // Fetch the profile data for the user being viewed
  useEffect(() => {
    const fetchTargetProfile = async () => {
      if (!targetUserId) {
        setTargetProfile(null)
        setIsLoadingProfile(false)
        return
      }

      if (targetUserId === user?.id) {
        if (authProfile) {
          setTargetProfile(authProfile)
          setIsLoadingProfile(false)
        } else {
          setIsLoadingProfile(true)
        }
        return
      }

      setIsLoadingProfile(true)

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', targetUserId)
          .single()

        if (error) throw error
        setTargetProfile(data)
      } catch (error) {
        console.error('Error fetching target profile:', error)
        setTargetProfile(null)
      } finally {
        setIsLoadingProfile(false)
      }
    }

    fetchTargetProfile()
  }, [targetUserId, user?.id, authProfile])

  // Fetch gallery photos
  const fetchGalleryPhotos = useCallback(async () => {
    if (!targetUserId) return
    
    setIsLoadingPhotos(true)
    try {
      const { data, error } = await supabase
        .from('gallery_photos')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setGalleryPhotos(data || [])
    } catch (error) {
      console.error('Error fetching gallery photos:', error)
    } finally {
      setIsLoadingPhotos(false)
    }
  }, [targetUserId])

  useEffect(() => {
    fetchGalleryPhotos()
  }, [fetchGalleryPhotos])

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0 || !user) return

    setIsUploading(true)

    try {
      // Upload all selected files
      for (const file of Array.from(files)) {
        // Validate file
        const validation = validateImage(file)
        if (!validation.valid) {
          addToast(`${file.name}: ${validation.error}`, 'error')
          continue
        }

        // Optimize image before upload
        logger.debug(`Optimizing ${file.name}...`)
        const optimizedFile = await optimizeImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          maxSizeMB: 1, // 1MB max for gallery photos
          quality: 0.85
        })

        // Create unique filename
        const fileExt = optimizedFile.name.split('.').pop()
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('gallery')
          .upload(fileName, optimizedFile)

        if (uploadError) throw uploadError

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('gallery')
          .getPublicUrl(fileName)

        // Save to database
        const { error: dbError } = await supabase
          .from('gallery_photos')
          .insert({
            user_id: user.id,
            photo_url: urlData.publicUrl
          })

        if (dbError) throw dbError
      }

      // Refresh gallery
      await fetchGalleryPhotos()
      logger.info(`Successfully uploaded ${files.length} photo(s)`)
      addToast(`Uploaded ${files.length} photo${files.length === 1 ? '' : 's'} successfully.`, 'success')
    } catch (error) {
      logger.error('Error uploading photos:', error)
      addToast('Failed to upload photos. Please try again.', 'error')
    } finally {
      setIsUploading(false)
      // Reset input
      event.target.value = ''
    }
  }

  const requestPhotoDelete = (photo: GalleryPhoto) => {
    if (deletingPhotoId) return
    setPhotoPendingDelete(photo)
  }

  const confirmPhotoDelete = async () => {
    if (!photoPendingDelete) return

    setDeletingPhotoId(photoPendingDelete.id)
    try {
      const urlParts = photoPendingDelete.photo_url.split('/gallery/')
      if (urlParts.length < 2) throw new Error('Invalid photo URL')
      const filePath = urlParts[1]

      const { error: storageError } = await supabase.storage
        .from('gallery')
        .remove([filePath])

      if (storageError) throw storageError

      const { error: dbError } = await supabase
        .from('gallery_photos')
        .delete()
        .eq('id', photoPendingDelete.id)

      if (dbError) throw dbError

      setGalleryPhotos(prev => prev.filter(p => p.id !== photoPendingDelete.id))
      addToast('Photo removed from gallery.', 'success')
    } catch (error) {
      console.error('Error deleting photo:', error)
      addToast('Failed to delete photo. Please try again.', 'error')
    } finally {
      setDeletingPhotoId(null)
      setPhotoPendingDelete(null)
    }
  }

  const confirmVideoDelete = async () => {
    if (!user || deletingVideo) return

    setDeletingVideo(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ highlight_video_url: null })
        .eq('id', user.id)

      if (error) throw error

      setTargetProfile(prev => (prev ? { ...prev, highlight_video_url: null } : prev))
      await invalidateProfile({ userId: user.id, reason: 'highlight-video-removed' })
      addToast('Highlight video removed.', 'success')
      setShowVideoDeleteModal(false)
    } catch (error) {
      console.error('Error deleting video:', error)
      addToast('Failed to remove video. Please try again.', 'error')
    } finally {
      setDeletingVideo(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Highlight Video Section - Only show for players */}
      {isLoadingProfile || isPlayerProfile ? (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Highlight Video</h2>
              <p className="text-sm text-gray-600">Showcase your best moments and skills</p>
            </div>
            {!readOnly && displayProfile?.highlight_video_url && (
              <Button
                variant="outline"
                onClick={() => setShowAddVideoModal(true)}
              >
                Manage
              </Button>
            )}
          </div>

          {isLoadingProfile ? (
            <div className="space-y-4">
              <Skeleton className="aspect-video w-full" variant="rectangular" />
              <Skeleton className="h-10 w-40" />
            </div>
          ) : displayProfile?.highlight_video_url ? (
            <div className="relative">
              <VideoEmbed url={displayProfile.highlight_video_url} />
              {!readOnly && (
                <button
                  onClick={() => setShowVideoDeleteModal(true)}
                  disabled={deletingVideo}
                  className="absolute right-4 top-4 rounded-lg bg-red-500 p-2 text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Remove video"
                  aria-label="Remove video"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center sm:p-12">
              <div className="mb-4 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
                  <Video className="h-10 w-10 text-white" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">No Highlight Video Yet</h3>
              <p className="mb-6 text-gray-600">
                {readOnly
                  ? 'This player has not added a highlight video yet.'
                  : 'Drop in your highlight reel so coaches can evaluate your skills faster.'}
              </p>
              {!readOnly && (
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button
                    onClick={() => setShowAddVideoModal(true)}
                    className="flex items-center gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Add Video Link
                  </Button>
                  <p className="max-w-xs text-center text-xs text-gray-500">
                    Uploading files directly is coming soon. For now, paste a share link from YouTube, Vimeo, or Google Drive.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Gallery Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Gallery</h2>
            <p className="text-sm text-gray-600">Share your best field hockey moments in Instagram-style</p>
          </div>
          {!readOnly && (
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={isUploading}
              />
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-playr-primary text-white rounded-lg hover:bg-playr-primary/90 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus className="w-4 h-4" />
                {isUploading ? 'Uploading...' : 'Add Photo'}
              </div>
            </label>
          )}
        </div>

        {isLoadingPhotos ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[3/4] w-full" variant="rectangular" />
            ))}
          </div>
        ) : galleryPhotos.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center sm:p-12">
            <p className="mb-4 text-gray-600">
              {readOnly ? 'No photos in gallery yet.' : 'No photos yet. Start building your gallery!'}
            </p>
            {!readOnly && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <div className="mx-auto inline-flex items-center gap-2 rounded-lg bg-playr-primary px-4 py-2 font-semibold text-white transition-all hover:bg-playr-primary/90">
                  <Plus className="h-4 w-4" />
                  Add Photo
                </div>
              </label>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {galleryPhotos.map((photo) => (
              <div key={photo.id} className="group relative aspect-[3/4] overflow-hidden rounded-lg">
                <img
                  src={photo.photo_url}
                  alt="Gallery"
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => setPreviewPhoto(photo)}
                  className="absolute inset-0 z-10 rounded-lg bg-black/0 opacity-0 transition-all focus-visible:ring-2 focus-visible:ring-white group-hover:bg-black/10 group-hover:opacity-100"
                  aria-label="View photo"
                  type="button"
                />
                {!readOnly && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black bg-opacity-0 transition-all group-hover:bg-opacity-40">
                    <button
                      onClick={() => requestPhotoDelete(photo)}
                      disabled={deletingPhotoId === photo.id}
                      className="pointer-events-auto opacity-0 group-hover:opacity-100 rounded-full bg-red-500 p-3 text-white transition-all hover:bg-red-600 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete photo"
                      aria-label="Delete photo"
                      type="button"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Video Link Modal */}
      <AddVideoLinkModal
        isOpen={showAddVideoModal}
        onClose={() => setShowAddVideoModal(false)}
        currentVideoUrl={displayProfile?.highlight_video_url || ''}
      />

      <ConfirmActionModal
        isOpen={Boolean(photoPendingDelete)}
        onClose={() => setPhotoPendingDelete(null)}
        onConfirm={confirmPhotoDelete}
        confirmLabel="Delete Photo"
        confirmTone="danger"
        confirmLoading={Boolean(deletingPhotoId)}
        loadingLabel="Deleting..."
        title="Remove photo from gallery?"
        description="This will permanently delete the photo from your media gallery."
        icon={<Trash2 className="h-6 w-6" />}
        body={photoPendingDelete ? (
          <div className="space-y-3">
            <p>Once deleted, teammates and coaches will no longer see this image on your profile.</p>
            <img
              src={photoPendingDelete.photo_url}
              alt="Photo scheduled for deletion"
              className="h-48 w-full rounded-lg object-cover"
              loading="lazy"
            />
          </div>
        ) : undefined}
      />

      <ConfirmActionModal
        isOpen={showVideoDeleteModal}
        onClose={() => setShowVideoDeleteModal(false)}
        onConfirm={confirmVideoDelete}
        confirmLabel="Remove Video"
        confirmTone="danger"
        confirmLoading={deletingVideo}
        loadingLabel="Removing..."
        title="Remove highlight video?"
        description="Your profile will no longer display a highlight reel until you add a new link."
        icon={<Video className="h-6 w-6" />}
      />

      <MediaLightbox
        media={previewPhoto ? { id: previewPhoto.id, url: previewPhoto.photo_url } : null}
        onClose={() => setPreviewPhoto(null)}
      />
    </div>
  )
}

// Video Embed Component
function VideoEmbed({ url }: { url: string }) {
  const getEmbedUrl = (url: string) => {
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = url.includes('youtu.be')
        ? url.split('youtu.be/')[1]?.split('?')[0]
        : new URLSearchParams(url.split('?')[1]).get('v')
      return `https://www.youtube.com/embed/${videoId}`
    }

    // Vimeo
    if (url.includes('vimeo.com')) {
      const videoId = url.split('vimeo.com/')[1]?.split('?')[0]
      return `https://player.vimeo.com/video/${videoId}`
    }

    // Google Drive
    if (url.includes('drive.google.com')) {
      const fileId = url.includes('/file/d/')
        ? url.split('/file/d/')[1]?.split('/')[0]
        : new URLSearchParams(url.split('?')[1]).get('id')
      return `https://drive.google.com/file/d/${fileId}/preview`
    }

    return url
  }

  const embedUrl = getEmbedUrl(url)
  const platform = url.includes('youtube') || url.includes('youtu.be')
    ? 'YouTube'
    : url.includes('vimeo')
    ? 'Vimeo'
    : url.includes('drive.google')
    ? 'Google Drive'
    : 'Video'

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-black aspect-video">
      <div className="absolute top-4 left-4 z-10">
        <span className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded">
          {platform}
        </span>
      </div>
      <iframe
        src={embedUrl}
        className="absolute top-0 left-0 w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Highlight video player"
      />
    </div>
  )
}
