import { useRef, useCallback, useEffect } from 'react'

interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeDown?: () => void
  threshold?: number
  velocityThreshold?: number
}

export interface DragOffset {
  x: number
  y: number
}

type Direction = 'horizontal' | 'vertical' | null

const DIRECTION_LOCK_THRESHOLD = 10

/**
 * Touch gesture hook for lightbox carousel.
 *
 * Uses refs (not state) for all tracking during the gesture to avoid
 * React batching delays. The caller reads `dragRef.current` inside
 * a requestAnimationFrame loop for smooth visual updates.
 *
 * Attaches native (non-passive) event listeners so we can call
 * preventDefault() to block browser scroll/navigation during swipe.
 */
export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeDown,
  threshold = 50,
  velocityThreshold = 0.3,
}: SwipeGestureOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragOffset>({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0, time: 0 })
  const directionRef = useRef<Direction>(null)

  // Store callbacks in refs to avoid re-attaching listeners
  const callbacksRef = useRef({ onSwipeLeft, onSwipeRight, onSwipeDown })
  callbacksRef.current = { onSwipeLeft, onSwipeRight, onSwipeDown }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0]
      startRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
      directionRef.current = null
      isDraggingRef.current = true
      dragRef.current = { x: 0, y: 0 }
    }

    function handleTouchMove(e: TouchEvent) {
      if (!isDraggingRef.current) return

      const touch = e.touches[0]
      const deltaX = touch.clientX - startRef.current.x
      const deltaY = touch.clientY - startRef.current.y

      // Lock direction on first significant movement
      if (directionRef.current === null) {
        if (Math.abs(deltaX) > DIRECTION_LOCK_THRESHOLD || Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD) {
          directionRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
        } else {
          return
        }
      }

      // Prevent browser scroll/back-swipe once direction is locked
      e.preventDefault()

      if (directionRef.current === 'horizontal') {
        dragRef.current = { x: deltaX, y: 0 }
      } else if (directionRef.current === 'vertical' && deltaY > 0) {
        dragRef.current = { x: 0, y: deltaY }
      }
    }

    function handleTouchEnd() {
      if (!isDraggingRef.current) return

      const elapsed = Date.now() - startRef.current.time
      const direction = directionRef.current
      const offset = dragRef.current
      const velocity = elapsed > 0
        ? Math.max(Math.abs(offset.x), Math.abs(offset.y)) / elapsed
        : 0

      if (direction === 'horizontal') {
        const pastThreshold = Math.abs(offset.x) > threshold || velocity > velocityThreshold
        if (pastThreshold) {
          if (offset.x < 0) callbacksRef.current.onSwipeLeft?.()
          else callbacksRef.current.onSwipeRight?.()
        }
      } else if (direction === 'vertical') {
        const pastThreshold = offset.y > threshold || velocity > velocityThreshold
        if (pastThreshold && offset.y > 0) {
          callbacksRef.current.onSwipeDown?.()
        }
      }

      dragRef.current = { x: 0, y: 0 }
      isDraggingRef.current = false
      directionRef.current = null
    }

    // Non-passive listeners so preventDefault() works on iOS Safari
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [threshold, velocityThreshold])

  return {
    containerRef,
    dragRef,
    isDraggingRef,
  }
}
