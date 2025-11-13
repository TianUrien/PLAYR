import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface LightboxMedia {
  id: string
  url: string
  alt?: string
}

interface MediaLightboxProps {
  media: LightboxMedia | null
  onClose: () => void
}

export default function MediaLightbox({ media, onClose }: MediaLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useFocusTrap({ containerRef: dialogRef, isActive: Boolean(media) })

  useEffect(() => {
    if (!media) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [media, onClose])

  if (!media) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Full screen media preview"
        tabIndex={-1}
        className="relative h-full w-full max-h-[min(90vh,800px)] max-w-4xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/70 p-2 text-white transition hover:bg-black"
          aria-label="Close preview"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          src={media.url}
          alt={media.alt || 'Media preview'}
          className="h-full w-full rounded-xl object-contain"
        />
      </div>
    </div>
  )
}
