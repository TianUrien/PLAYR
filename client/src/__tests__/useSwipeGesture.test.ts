import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

/**
 * Tests for the swipe gesture algorithm.
 *
 * jsdom doesn't provide the Touch constructor, so we polyfill it and
 * replicate the hook's core logic via native addEventListener on a
 * real DOM element — the same event pipeline the browser uses.
 *
 * Integration tests (hook + MediaLightbox component) are in
 * mediaLightbox.test.tsx.
 */

// Polyfill Touch for jsdom
beforeAll(() => {
  if (typeof globalThis.Touch === 'undefined') {
    // @ts-expect-error jsdom Touch polyfill
    globalThis.Touch = class Touch {
      identifier: number
      target: EventTarget
      clientX: number
      clientY: number
      constructor(init: { identifier: number; target: EventTarget; clientX: number; clientY: number }) {
        this.identifier = init.identifier
        this.target = init.target
        this.clientX = init.clientX
        this.clientY = init.clientY
      }
    }
  }
})

function createTouch(el: HTMLElement, x: number, y: number): Touch {
  return new Touch({ identifier: 0, target: el, clientX: x, clientY: y })
}

function fireTouchStart(el: HTMLElement, x: number, y: number) {
  el.dispatchEvent(
    new TouchEvent('touchstart', {
      touches: [createTouch(el, x, y)],
      bubbles: true,
    })
  )
}

function fireTouchMove(el: HTMLElement, x: number, y: number) {
  el.dispatchEvent(
    new TouchEvent('touchmove', {
      touches: [createTouch(el, x, y)],
      bubbles: true,
      cancelable: true,
    })
  )
}

function fireTouchEnd(el: HTMLElement) {
  el.dispatchEvent(
    new TouchEvent('touchend', {
      touches: [],
      bubbles: true,
    })
  )
}

/**
 * Creates a container with swipe gesture listeners attached
 * (mirrors useSwipeGesture's core algorithm for isolated testing).
 */
function setupGestureContainer(options: {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeDown?: () => void
  threshold?: number
}) {
  const { onSwipeLeft, onSwipeRight, onSwipeDown, threshold = 50 } = options
  const el = document.createElement('div')
  document.body.appendChild(el)

  let startX = 0
  let startY = 0
  let direction: 'horizontal' | 'vertical' | null = null
  let dragX = 0
  let dragY = 0

  el.addEventListener('touchstart', (e) => {
    const touch = e.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    direction = null
    dragX = 0
    dragY = 0
  }, { passive: true })

  el.addEventListener('touchmove', (e) => {
    const touch = e.touches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY

    if (direction === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        direction = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
      } else {
        return
      }
    }

    e.preventDefault()

    if (direction === 'horizontal') {
      dragX = deltaX
      dragY = 0
    } else if (direction === 'vertical' && deltaY > 0) {
      dragX = 0
      dragY = deltaY
    }
  }, { passive: false })

  el.addEventListener('touchend', () => {
    if (direction === 'horizontal') {
      if (Math.abs(dragX) > threshold) {
        if (dragX < 0) onSwipeLeft?.()
        else onSwipeRight?.()
      }
    } else if (direction === 'vertical') {
      if (dragY > threshold) {
        onSwipeDown?.()
      }
    }
    dragX = 0
    dragY = 0
    direction = null
  }, { passive: true })

  return el
}

describe('useSwipeGesture (DOM-level)', () => {
  const containers: HTMLElement[] = []

  afterEach(() => {
    containers.forEach((el) => el.remove())
    containers.length = 0
  })

  function setup(options: Parameters<typeof setupGestureContainer>[0]) {
    const el = setupGestureContainer(options)
    containers.push(el)
    return el
  }

  it('calls onSwipeLeft when swiped left past threshold', () => {
    const onSwipeLeft = vi.fn()
    const el = setup({ onSwipeLeft, threshold: 50 })

    fireTouchStart(el, 200, 100)
    fireTouchMove(el, 100, 100)
    fireTouchEnd(el)

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })

  it('calls onSwipeRight when swiped right past threshold', () => {
    const onSwipeRight = vi.fn()
    const el = setup({ onSwipeRight, threshold: 50 })

    fireTouchStart(el, 100, 100)
    fireTouchMove(el, 200, 100)
    fireTouchEnd(el)

    expect(onSwipeRight).toHaveBeenCalledOnce()
  })

  it('calls onSwipeDown when swiped down past threshold', () => {
    const onSwipeDown = vi.fn()
    const el = setup({ onSwipeDown, threshold: 50 })

    fireTouchStart(el, 100, 100)
    fireTouchMove(el, 100, 250)
    fireTouchEnd(el)

    expect(onSwipeDown).toHaveBeenCalledOnce()
  })

  it('does not trigger if below threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const el = setup({ onSwipeLeft, onSwipeRight, threshold: 50 })

    fireTouchStart(el, 100, 100)
    fireTouchMove(el, 80, 100) // 20px — below 50px threshold
    fireTouchEnd(el)

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('direction locks to horizontal when horizontal delta is larger', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeDown = vi.fn()
    const el = setup({ onSwipeLeft, onSwipeDown, threshold: 50 })

    fireTouchStart(el, 200, 100)
    fireTouchMove(el, 100, 130) // mostly horizontal
    fireTouchEnd(el)

    expect(onSwipeLeft).toHaveBeenCalledOnce()
    expect(onSwipeDown).not.toHaveBeenCalled()
  })

  it('direction locks to vertical when vertical delta is larger', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeDown = vi.fn()
    const el = setup({ onSwipeLeft, onSwipeDown, threshold: 50 })

    fireTouchStart(el, 100, 100)
    fireTouchMove(el, 120, 250) // mostly vertical
    fireTouchEnd(el)

    expect(onSwipeDown).toHaveBeenCalledOnce()
    expect(onSwipeLeft).not.toHaveBeenCalled()
  })

  it('a single long swipe fires callback exactly once', () => {
    const onSwipeLeft = vi.fn()
    const el = setup({ onSwipeLeft, threshold: 50 })

    fireTouchStart(el, 400, 100)
    fireTouchMove(el, 300, 100)
    fireTouchMove(el, 200, 100)
    fireTouchMove(el, 100, 100)
    fireTouchEnd(el)

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })

  it('does not call onSwipeDown for upward swipes', () => {
    const onSwipeDown = vi.fn()
    const el = setup({ onSwipeDown, threshold: 50 })

    fireTouchStart(el, 100, 200)
    fireTouchMove(el, 100, 50) // upward
    fireTouchEnd(el)

    expect(onSwipeDown).not.toHaveBeenCalled()
  })
})
