import { useEffect } from 'react'

export function useSafeArea() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }

    const root = document.documentElement

    const updateInsets = () => {
      const viewport = window.visualViewport
      if (!viewport) {
        root.style.setProperty('--chat-safe-area-bottom', '0px')
        root.style.setProperty('--chat-safe-area-right', '0px')
        root.style.setProperty('--chat-safe-area-top', '0px')
        return
      }

      const bottomInset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
      const rightInset = Math.max(0, window.innerWidth - (viewport.width + viewport.offsetLeft))
      const topInset = Math.max(0, viewport.offsetTop)

      root.style.setProperty('--chat-safe-area-bottom', `${bottomInset}px`)
      root.style.setProperty('--chat-safe-area-right', `${rightInset}px`)
      root.style.setProperty('--chat-safe-area-top', `${topInset}px`)
    }

    updateInsets()

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', updateInsets)
    window.addEventListener('resize', updateInsets)
    window.addEventListener('orientationchange', updateInsets)

    return () => {
      viewport?.removeEventListener('resize', updateInsets)
      window.removeEventListener('resize', updateInsets)
      window.removeEventListener('orientationchange', updateInsets)
    }
  }, [])
}
