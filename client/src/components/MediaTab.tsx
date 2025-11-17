import { useState, useEffect, type ReactNode } from 'react'
import { Video, Upload, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import type { Profile } from '@/lib/supabase'
import Button from './Button'
import AddVideoLinkModal from './AddVideoLinkModal'
import { invalidateProfile } from '@/lib/profile'
import { useToastStore } from '@/lib/toast'
import ConfirmActionModal from './ConfirmActionModal'
import Skeleton from './Skeleton'
import GalleryManager from './GalleryManager'

interface MediaTabHeaderRenderProps {
  canManageVideo: boolean
  openManageModal: () => void
}

interface MediaTabProps {
  profileId?: string
  readOnly?: boolean
  renderHeader?: (props: MediaTabHeaderRenderProps) => ReactNode
}

export default function MediaTab({ profileId, readOnly = false, renderHeader }: MediaTabProps) {
  const { user, profile: authProfile } = useAuthStore()
  const targetUserId = profileId || user?.id
  const { addToast } = useToastStore()
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [targetProfile, setTargetProfile] = useState<Profile | null>(null)
  const [showAddVideoModal, setShowAddVideoModal] = useState(false)
  const [deletingVideo, setDeletingVideo] = useState(false)
  const [showVideoDeleteModal, setShowVideoDeleteModal] = useState(false)

  // Use the target profile if viewing someone else, otherwise use auth profile
  const displayProfile = targetProfile || authProfile
  const isPlayerProfile = displayProfile?.role === 'player'
  const canManageHighlightVideo = Boolean(!readOnly && displayProfile?.highlight_video_url)

  const openManageModal = () => setShowAddVideoModal(true)

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

  const canManageGallery = Boolean(!readOnly && targetUserId && targetUserId === user?.id)
  const galleryEmptyCopy = canManageGallery ? 'No photos yet. Start building your gallery!' : 'No photos in gallery yet.'

  return (
    <div className="space-y-8">
      {/* Highlight Video Section - Only show for players */}
      {isLoadingProfile || isPlayerProfile ? (
        <div>
          {(() => {
            const headerContent = renderHeader
              ? renderHeader({ canManageVideo: canManageHighlightVideo, openManageModal })
              : canManageHighlightVideo && (
                  <div className="flex items-center justify-end">
                    <Button variant="outline" onClick={openManageModal}>
                      Manage
                    </Button>
                  </div>
                )
            return headerContent ? <div className="mb-3">{headerContent}</div> : null
          })()}

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

      <GalleryManager
        mode="profile"
        entityId={targetUserId}
        readOnly={!canManageGallery}
        title="Gallery"
        description="Share your best field hockey moments in Instagram-style"
        emptyStateDescription={galleryEmptyCopy}
        addButtonLabel="Add Photo"
      />

      {/* Add Video Link Modal */}
      <AddVideoLinkModal
        isOpen={showAddVideoModal}
        onClose={() => setShowAddVideoModal(false)}
        currentVideoUrl={displayProfile?.highlight_video_url || ''}
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
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        title="Highlight video player"
      />
    </div>
  )
}
