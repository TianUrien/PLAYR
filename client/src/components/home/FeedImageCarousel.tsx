import { useRef, useState, useEffect, useCallback } from 'react'

interface CarouselImage {
  url: string
  order: number
}

interface FeedImageCarouselProps {
  images: CarouselImage[]
  altPrefix: string
}

export function FeedImageCarousel({ images, altPrefix }: FeedImageCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentSlide, setCurrentSlide] = useState(0)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || images.length <= 1) return
    const index = Math.round(el.scrollLeft / el.offsetWidth)
    setCurrentSlide(index)
  }, [images.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none]"
      >
        {images.map((img, i) => (
          <div key={i} className="flex-shrink-0 w-full snap-start">
            <div className="aspect-[4/3] bg-gray-100">
              <img
                src={img.url}
                alt={`${altPrefix} - image ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 bg-white">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to image ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentSlide ? 'bg-indigo-500' : 'bg-gray-300'
              }`}
              onClick={() => {
                scrollRef.current?.scrollTo({
                  left: i * (scrollRef.current?.offsetWidth ?? 0),
                  behavior: 'smooth',
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
