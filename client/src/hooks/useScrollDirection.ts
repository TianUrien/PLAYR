import { useState, useEffect, useRef } from 'react'

/**
 * Detects scroll direction. Returns 'up' when scrolling up or near page top,
 * 'down' when scrolling down past the threshold.
 *
 * @param threshold - Minimum scroll delta (px) to trigger a direction change.
 *                    Prevents jittery flips on tiny movements.
 */
export function useScrollDirection(threshold = 10) {
  const [direction, setDirection] = useState<'up' | 'down'>('up')
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    lastScrollY.current = window.scrollY

    const updateDirection = () => {
      const scrollY = window.scrollY

      // Always show when near top of page
      if (scrollY < threshold) {
        setDirection('up')
        lastScrollY.current = scrollY
        ticking.current = false
        return
      }

      const diff = scrollY - lastScrollY.current

      if (Math.abs(diff) >= threshold) {
        setDirection(diff > 0 ? 'down' : 'up')
        lastScrollY.current = scrollY
      }

      ticking.current = false
    }

    const handleScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(updateDirection)
        ticking.current = true
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [threshold])

  return direction
}
