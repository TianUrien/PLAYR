import { useState, useEffect, type ImgHTMLAttributes } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StorageImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError' | 'onLoad' | 'src'> {
  /** The image source URL */
  src: string | null | undefined
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
}

/**
 * StorageImage component handles image loading with proper error states.
 * Use this for any images loaded from Supabase Storage (journey logos, gallery photos, etc.)
 * to avoid displaying broken image icons when images fail to load.
 */
export default function StorageImage({
  src,
  alt,
  className,
  containerClassName,
  fallbackClassName,
  fallback,
  showLoading = true,
  onImageError,
  onImageLoad,
  loading = 'lazy',
  ...rest
}: StorageImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Reset loading/error states when src changes
  useEffect(() => {
    setImageLoaded(false)
    setImageError(false)
  }, [src])

  const handleLoad = () => {
    setImageLoaded(true)
    setImageError(false)
    onImageLoad?.()
  }

  const handleError = () => {
    console.error('[StorageImage] Failed to load image:', src)
    setImageLoaded(true)
    setImageError(true)
    onImageError?.()
  }

  // No src provided - show fallback immediately
  if (!src) {
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
      {/* Loading skeleton */}
      {showLoading && !imageLoaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200 rounded-[inherit]" />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          'transition-opacity duration-200',
          imageLoaded ? 'opacity-100' : 'opacity-0',
          className
        )}
        loading={loading}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
    </div>
  )
}
