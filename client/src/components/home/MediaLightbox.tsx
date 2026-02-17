import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import type { PostMediaItem } from '@/types/homeFeed'

interface MediaLightboxProps {
  images: PostMediaItem[]
  initialIndex: number
  onClose: () => void
}

/** Rubber-band resistance at carousel boundaries (0–1, lower = more resistance) */
const EDGE_RESISTANCE = 0.3

export function MediaLightbox({ images, initialIndex, onClose }: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const dialogRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useFocusTrap({ containerRef: dialogRef, isActive: true })

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, images.length - 1))
  }, [images.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  const { containerRef, dragRef, isDraggingRef } = useSwipeGesture({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    onSwipeDown: onClose,
  })

  // rAF loop: read refs and apply transforms directly to DOM (no React re-renders during drag)
  useEffect(() => {
    const track = trackRef.current
    const dialog = dialogRef.current
    if (!track || !dialog) return

    let lastX = 0
    let lastY = 0
    let lastDragging = false

    function tick() {
      const offset = dragRef.current
      const dragging = isDraggingRef.current

      // Only write to DOM when values change
      if (offset.x !== lastX || offset.y !== lastY || dragging !== lastDragging) {
        lastX = offset.x
        lastY = offset.y
        lastDragging = dragging

        const viewportWidth = track!.parentElement?.clientWidth || window.innerWidth
        let dragPercent = viewportWidth > 0 ? (offset.x / viewportWidth) * 100 : 0

        // Edge resistance: dampen drag at boundaries
        const idx = currentIndex
        if ((idx === 0 && dragPercent > 0) || (idx === images.length - 1 && dragPercent < 0)) {
          dragPercent *= EDGE_RESISTANCE
        }

        const baseTranslate = -(idx * 100)
        const swipeDownY = offset.y
        const swipeDownOpacity = Math.max(0, 1 - offset.y / 300)

        if (dragging) {
          track!.style.transition = 'none'
          track!.style.transform = `translateX(${baseTranslate + dragPercent}%) translateY(${swipeDownY}px)`
          track!.style.opacity = swipeDownY > 0 ? String(swipeDownOpacity) : '1'
          dialog!.style.backgroundColor = `rgba(0, 0, 0, ${0.95 * swipeDownOpacity})`
        } else {
          // Snap: restore CSS transition
          track!.style.transition = 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 300ms ease-out'
          track!.style.transform = `translateX(${baseTranslate}%)`
          track!.style.opacity = '1'
          dialog!.style.backgroundColor = 'rgba(0, 0, 0, 0.95)'
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [currentIndex, images.length, dragRef, isDraggingRef])

  // Keyboard navigation + Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowRight':
          goNext()
          break
        case 'ArrowLeft':
          goPrev()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goNext, goPrev])

  // Scroll lock
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const hasMultiple = images.length > 1
  const isFirst = currentIndex === 0
  const isLast = currentIndex === images.length - 1

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[1000] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      tabIndex={-1}
      onClick={onClose}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}
    >
      {/* Header: close button + position indicator */}
      <div className="flex items-center justify-between px-4 py-3 relative z-10">
        <div className="w-10" />
        {hasMultiple && (
          <span
            className="text-white/80 text-sm font-medium"
            aria-live="polite"
          >
            {currentIndex + 1} / {images.length}
          </span>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Carousel — touch-action: none prevents browser gesture interference */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ touchAction: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={trackRef}
          className="flex h-full"
          style={{
            transform: `translateX(${-(currentIndex * 100)}%)`,
            transition: 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        >
          {images.map((image, i) => (
            <div
              key={image.url}
              className="w-full h-full flex-shrink-0 flex items-center justify-center px-4"
            >
              <img
                src={image.url}
                alt={`Post image ${i + 1}${hasMultiple ? ` of ${images.length}` : ''}`}
                className="max-w-full max-h-[85vh] object-contain select-none pointer-events-none"
                draggable={false}
                loading={Math.abs(i - currentIndex) <= 1 ? 'eager' : 'lazy'}
              />
            </div>
          ))}
        </div>

        {/* Desktop arrow buttons */}
        {hasMultiple && !isFirst && (
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation()
              goPrev()
            }}
            className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {hasMultiple && !isLast && (
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation()
              goNext()
            }}
            className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
