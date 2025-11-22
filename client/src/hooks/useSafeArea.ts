import { useEffect } from 'react'

const MAX_SAFE_AREA_PX = 60

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
        root.style.setProperty('--chat-keyboard-offset', '0px')
        root.style.setProperty('--chat-viewport-height', `${window.innerHeight}px`)
        return
      }

      const rawBottomInset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop))
      const safeAreaBottom = Math.min(rawBottomInset, MAX_SAFE_AREA_PX)
      const keyboardOffset = Math.max(0, rawBottomInset - safeAreaBottom)
      const rightInset = Math.max(0, window.innerWidth - (viewport.width + viewport.offsetLeft))
      const topInset = Math.max(0, viewport.offsetTop)

      root.style.setProperty('--chat-safe-area-bottom', `${safeAreaBottom}px`)
      root.style.setProperty('--chat-safe-area-right', `${rightInset}px`)
      root.style.setProperty('--chat-safe-area-top', `${topInset}px`)
      root.style.setProperty('--chat-keyboard-offset', `${keyboardOffset}px`)
      root.style.setProperty('--chat-viewport-height', `${viewport.height}px`)
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
      root.style.removeProperty('--chat-viewport-height')
      root.style.removeProperty('--chat-safe-area-bottom')
      root.style.removeProperty('--chat-safe-area-right')
      root.style.removeProperty('--chat-safe-area-top')
      root.style.removeProperty('--chat-keyboard-offset')
    }
  }, [])
}
