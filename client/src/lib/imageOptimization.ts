/**
 * Image optimization utility
 * Compresses and resizes images before upload to reduce bandwidth and storage costs
 */

import { logger } from './logger'

interface OptimizeOptions {
  maxWidth?: number
  maxHeight?: number
  maxSizeMB?: number
  quality?: number
  mimeType?: string
}

const DEFAULT_OPTIONS: Required<OptimizeOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  maxSizeMB: 1,
  quality: 0.8, // 0-1 scale
  mimeType: 'image/jpeg'
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
    
    // Calculate new dimensions
    const { width, height } = calculateDimensions(
      img.width,
      img.height,
      opts.maxWidth,
      opts.maxHeight
    )
    
    // Resize and compress
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }
    
    // Draw resized image
    ctx.drawImage(img, 0, 0, width, height)
    
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
export function validateImage(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: 'File must be an image' }
  }
  
  // Check file size (before optimization - allow up to 10MB)
  const maxSizeBeforeOptimization = 10 * 1024 * 1024 // 10MB
  if (file.size > maxSizeBeforeOptimization) {
    return {
      valid: false,
      error: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 10 MB.`
    }
  }
  
  // Check file name
  if (!file.name || file.name.length > 255) {
    return { valid: false, error: 'Invalid file name' }
  }
  
  return { valid: true }
}
