import { useState, useEffect, type ImgHTMLAttributes } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'

interface StorageImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError' | 'onLoad' | 'src'> {
  /** The image source URL */
  src: string | null | undefined
  /** Fallback image URL if primary src fails (e.g. full image when thumbnail 404s) */
  fallbackSrc?: string | null
  /** Alt text for accessibility */
  alt: string
  /** CSS classes for the image */
  className?: string
  /** CSS classes for the container wrapper */
  containerClassName?: string
  /** CSS classes for the fallback placeholder */
  fallbackClassName?: string
  /** Custom fallback element to render on error */
  fallback?: React.ReactNode
  /** Whether to show a loading skeleton while the image loads */
  showLoading?: boolean
  /** Callback when image fails to load */
  onImageError?: () => void
  /** Callback when image successfully loads */
  onImageLoad?: () => void
  /** Fetch priority hint for the browser */
  fetchPriority?: 'high' | 'low' | 'auto'
}

/**
 * StorageImage component handles image loading with proper error states.
 * Use this for any images loaded from Supabase Storage (journey logos, gallery photos, etc.)
 * to avoid displaying broken image icons when images fail to load.
 */
export default function StorageImage({
  src,
  fallbackSrc,
  alt,
  className,
  containerClassName,
  fallbackClassName,
  fallback,
  showLoading = true,
  onImageError,
  onImageLoad,
  loading = 'lazy',
  fetchPriority,
  ...rest
}: StorageImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [usingFallbackSrc, setUsingFallbackSrc] = useState(false)

  // Reset loading/error states when src changes
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
    setUsingFallbackSrc(false)
  }, [src])

  const handleLoad = () => {
    setImageLoaded(true)
    setImageError(false)
    onImageLoad?.()
  }

  const handleError = () => {
    // If primary src failed and we have a fallback, try it
    if (!usingFallbackSrc && fallbackSrc && fallbackSrc !== src) {
      logger.debug('[StorageImage] Primary src failed, trying fallback:', fallbackSrc)
      setUsingFallbackSrc(true)
      return
    }

    logger.error('[StorageImage] Failed to load image:', usingFallbackSrc ? fallbackSrc : src)
    setImageLoaded(true)
    setImageError(true)
    onImageError?.()
  }

  const activeSrc = usingFallbackSrc ? fallbackSrc : src

  // No src provided - show fallback immediately
  if (!activeSrc) {
    return (
      <div className={cn('flex items-center justify-center bg-gray-100 text-gray-400', containerClassName, fallbackClassName)}>
        {fallback ?? <ImageIcon className="h-5 w-5" />}
      </div>
    )
  }

  // Image failed to load - show fallback
  if (imageError) {
    return (
      <div className={cn('flex items-center justify-center bg-gray-100 text-gray-400', containerClassName, fallbackClassName)}>
        {fallback ?? <ImageIcon className="h-5 w-5" />}
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden flex-shrink-0', containerClassName)}>
      {/* Loading skeleton — faster 1s pulse for responsiveness */}
      {showLoading && !imageLoaded && (
        <div className="absolute inset-0 animate-pulse rounded-[inherit] bg-gray-200 [animation-duration:1s]" />
      )}
      <img
        src={activeSrc}
        alt={alt}
        className={cn(
          'transition-opacity duration-200',
          imageLoaded ? 'opacity-100' : 'opacity-0',
          className
        )}
        loading={fetchPriority === 'high' ? 'eager' : loading}
        fetchPriority={fetchPriority}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
    </div>
  )
}
