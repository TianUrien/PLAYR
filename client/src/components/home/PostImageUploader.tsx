import { useRef, useCallback } from 'react'
import { ImagePlus, X, Loader2 } from 'lucide-react'

export interface UploadedImage {
  url: string
  order: number
}

interface PostImageUploaderProps {
  images: UploadedImage[]
  onAdd: (file: File) => Promise<void>
  onRemove: (index: number) => void
  isUploading: boolean
  maxImages?: number
}

export function PostImageUploader({
  images,
  onAdd,
  onRemove,
  isUploading,
  maxImages = 4,
}: PostImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await onAdd(file)
  }, [onAdd])

  const canAddMore = images.length < maxImages

  if (images.length === 0) {
    return (
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-6 h-6" />
              <span className="text-sm">Add images (up to {maxImages})</span>
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    )
  }

  // Grid layout based on image count
  const gridClass =
    images.length === 1
      ? 'grid-cols-1'
      : 'grid-cols-2'

  return (
    <div>
      <div className={`grid ${gridClass} gap-2`}>
        {images.map((img, i) => (
          <div
            key={img.url}
            className={`relative rounded-lg overflow-hidden bg-gray-100 group ${
              images.length === 1 ? 'aspect-[16/9]' : 'aspect-square'
            }`}
          >
            <img
              src={img.url}
              alt={`Upload ${i + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            {i === 0 && images.length > 1 && (
              <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                Main
              </span>
            )}
          </div>
        ))}

        {/* Add more button */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors disabled:opacity-50 ${
              images.length === 1 ? 'aspect-[16/9]' : 'aspect-square'
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <ImagePlus className="w-5 h-5" />
                <span className="text-xs">Add</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
