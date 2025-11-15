import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface ImagePreviewModalProps {
  src: string
  alt?: string
  title?: string
  isOpen: boolean
  onClose: () => void
}

export default function ImagePreviewModal({ src, alt, title, isOpen, onClose }: ImagePreviewModalProps) {
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={alt || title || 'Profile image preview'}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl" 
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute -right-3 -top-3 rounded-full bg-white/90 p-2 text-gray-700 shadow-lg transition hover:bg-white"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="rounded-3xl bg-gradient-to-br from-gray-900/70 to-gray-800/40 p-4 shadow-2xl">
          <img
            src={src}
            alt={alt || title || 'Profile image'}
            className="max-h-[75vh] w-full rounded-2xl object-contain"
          />
          {title ? (
            <p className="mt-4 text-center text-sm font-medium text-white/80">{title}</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  )
}
