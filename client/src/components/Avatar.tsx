import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { cn } from '@/lib/utils'
import { useProfileImagePreview } from './ProfileImagePreviewProvider'

interface AvatarProps {
  src?: string | null
  alt?: string
  initials?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  loading?: 'lazy' | 'eager'
  enablePreview?: boolean
  previewTitle?: string
  previewInteraction?: 'auto' | 'pointer'
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-24 h-24 text-3xl'
}

export default function Avatar({
  src,
  alt,
  initials,
  size = 'md',
  className,
  loading = 'lazy',
  enablePreview = false,
  previewTitle,
  previewInteraction = 'auto',
}: AvatarProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const { openPreview } = useProfileImagePreview()
  const canPreview = Boolean(enablePreview && src)

  const triggerPreview = () => {
    if (!canPreview || !src) return
    openPreview({ src, alt, title: previewTitle || alt || initials || undefined })
  }

  const handlePreviewClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canPreview) return
    event.preventDefault()
    event.stopPropagation()
    triggerPreview()
  }

  const handlePreviewKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canPreview) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      triggerPreview()
    }
  }

  const previewProps = canPreview
    ? previewInteraction === 'pointer'
      ? {
          onClick: handlePreviewClick,
        }
      : {
          role: 'button' as const,
          tabIndex: 0,
          onClick: handlePreviewClick,
          onKeyDown: handlePreviewKey,
          'aria-label': previewTitle || alt || 'Open profile image preview',
        }
    : {}

  return (
    <div
      className={cn(
        'relative aspect-square rounded-full overflow-hidden bg-gradient-to-br from-[#8026FA] to-[#924CEC] font-semibold text-white flex items-center justify-center flex-shrink-0',
        canPreview &&
          (previewInteraction === 'auto'
            ? 'cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#8026FA]'
            : 'cursor-zoom-in'),
        sizeClasses[size],
        className
      )}
      {...previewProps}
    >
      {src && !imageError ? (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gray-200 animate-pulse" />
          )}
          <img 
            src={src} 
            alt={alt || 'Avatar'} 
            className={cn(
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-200',
              imageLoaded ? "opacity-100" : "opacity-0"
            )}
            loading={loading}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        </>
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <span>?</span>
      )}
    </div>
  )
}
