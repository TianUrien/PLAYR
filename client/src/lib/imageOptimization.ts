/**
 * Image optimization utility
 * Compresses and resizes images before upload to reduce bandwidth and storage costs
 */

import { logger } from './logger'

export interface OptimizeOptions {
  maxWidth?: number
  maxHeight?: number
  maxSizeMB?: number
  quality?: number
  mimeType?: string
  forceSquare?: boolean
  squareSize?: number
}

const DEFAULT_OPTIONS: Required<OptimizeOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  maxSizeMB: 1,
  quality: 0.8, // 0-1 scale
  mimeType: 'image/jpeg',
  forceSquare: false,
  squareSize: 512,
}

/**
 * Optimize an image file before upload
 * Resizes if too large and compresses to target file size
 * 
 * @example
 * ```typescript
 * const file = event.target.files[0]
 * const optimized = await optimizeImage(file)
 * // Upload optimized file to Supabase
 * ```
 */
export async function optimizeImage(
  file: File,
  options: OptimizeOptions = {}
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Skip optimization for non-image files
  if (!file.type.startsWith('image/')) {
    logger.warn('File is not an image, skipping optimization:', file.type)
    return file
  }
  
  // Skip optimization for SVG (vector format, already small)
  if (file.type === 'image/svg+xml') {
    logger.debug('SVG detected, skipping optimization')
    return file
  }
  
  try {
    logger.debug(`Optimizing image: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    
    // Load image
    const img = await loadImage(file)
    
    const shouldForceSquare = opts.forceSquare
    const canvas = document.createElement('canvas')
    let drawSourceX = 0
    let drawSourceY = 0
    let drawSourceWidth = img.width
    let drawSourceHeight = img.height

    if (shouldForceSquare) {
      const sourceSide = Math.min(img.width, img.height)
      const targetSide = Math.min(opts.squareSize, sourceSide)
      drawSourceX = (img.width - sourceSide) / 2
      drawSourceY = (img.height - sourceSide) / 2
      drawSourceWidth = sourceSide
      drawSourceHeight = sourceSide
      canvas.width = targetSide
      canvas.height = targetSide
    } else {
      const { width, height } = calculateDimensions(
        img.width,
        img.height,
        opts.maxWidth,
        opts.maxHeight
      )
      canvas.width = width
      canvas.height = height
    }
    const targetWidth = canvas.width
    const targetHeight = canvas.height

    // Resize and compress
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }
    
    // Draw resized image
    ctx.drawImage(
      img,
      drawSourceX,
      drawSourceY,
      drawSourceWidth,
      drawSourceHeight,
      0,
      0,
      targetWidth,
      targetHeight
    )
    
    // Convert to blob with compression
    const blob = await canvasToBlob(canvas, opts.mimeType, opts.quality)
    
    // If still too large, reduce quality further
    let finalBlob = blob
    let currentQuality = opts.quality
    const maxBytes = opts.maxSizeMB * 1024 * 1024
    
    while (finalBlob.size > maxBytes && currentQuality > 0.1) {
      currentQuality -= 0.1
      logger.debug(`Image still ${(finalBlob.size / 1024 / 1024).toFixed(2)} MB, reducing quality to ${currentQuality.toFixed(1)}`)
      finalBlob = await canvasToBlob(canvas, opts.mimeType, currentQuality)
    }
    
    // Create new file from blob
    const optimizedFile = new File(
      [finalBlob],
      file.name,
      { type: opts.mimeType }
    )
    
    const originalSize = file.size / 1024 / 1024
    const optimizedSize = optimizedFile.size / 1024 / 1024
    const savings = ((1 - optimizedSize / originalSize) * 100).toFixed(1)
    
    logger.info(
      `Image optimized: ${originalSize.toFixed(2)} MB → ${optimizedSize.toFixed(2)} MB (${savings}% reduction)`
    )
    
    return optimizedFile
  } catch (error) {
    logger.error('Error optimizing image, using original:', error)
    return file // Return original on error
  }
}

export async function optimizeAvatarImage(file: File): Promise<File> {
  const isPng = file.type === 'image/png'
  return optimizeImage(file, {
    maxWidth: 1024,
    maxHeight: 1024,
    maxSizeMB: 1.5,
    quality: 0.92,
    mimeType: isPng ? 'image/png' : 'image/jpeg',
    forceSquare: true,
    squareSize: 512,
  })
}

/**
 * Load image from file
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    
    img.src = url
  })
}

/**
 * Calculate new dimensions while maintaining aspect ratio
 */
function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let width = originalWidth
  let height = originalHeight
  
  // Calculate aspect ratio
  const aspectRatio = width / height
  
  // Resize if too large
  if (width > maxWidth) {
    width = maxWidth
    height = width / aspectRatio
  }
  
  if (height > maxHeight) {
    height = maxHeight
    width = height * aspectRatio
  }
  
  return {
    width: Math.round(width),
    height: Math.round(height)
  }
}

/**
 * Convert canvas to blob
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      },
      mimeType,
      quality
    )
  })
}

/**
 * Validate image file before upload
 */
export type ImageValidationOptions = {
  maxFileSizeMB: number
  allowedMimeTypes?: string[]
}

const DEFAULT_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg']

export function validateImage(file: File, options: ImageValidationOptions): { valid: boolean; error?: string } {
  const { maxFileSizeMB, allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES } = options

  const normalizedName = file.name?.toLowerCase() ?? ''
  const hasValidExtension = normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg') || normalizedName.endsWith('.png')
  const hasValidMime = allowedMimeTypes.includes(file.type.toLowerCase())

  if (!hasValidExtension || !hasValidMime) {
    return { valid: false, error: 'Only JPG/JPEG or PNG images are allowed.' }
  }

  const maxBytes = maxFileSizeMB * 1024 * 1024
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `Image is too large. Max ${maxFileSizeMB}MB.`,
    }
  }

  if (!file.name || file.name.length > 255) {
    return { valid: false, error: 'Invalid file name' }
  }

  return { valid: true }
}
