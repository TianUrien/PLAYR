// Global type extensions for PLAYR app
export {}

declare global {
  interface Window {
    __updateUnreadBadge?: (delta: number) => void
    __refreshUnreadBadge?: () => void
  }
}
