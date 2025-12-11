import { useState, useEffect, useCallback } from 'react'
import { X, Download, Share, Plus } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

type InstallState = 'idle' | 'can-install' | 'ios-safari' | 'installed'

export default function InstallPrompt() {
  const [installState, setInstallState] = useState<InstallState>('idle')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)

  // Check if running as installed PWA
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  // Check if iOS Safari
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && 
    !('MSStream' in window)
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  const isIOSSafari = isIOS && isSafari

  // Check localStorage for dismissal
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10)
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true)
      }
    }

    // If running standalone, mark as installed
    if (isStandalone) {
      setInstallState('installed')
      return
    }

    // iOS Safari gets special treatment
    if (isIOSSafari) {
      setInstallState('ios-safari')
    }
  }, [isStandalone, isIOSSafari])

  // Listen for the install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallState('can-install')
    }

    const handleAppInstalled = () => {
      setInstallState('installed')
      setDeferredPrompt(null)
      localStorage.removeItem('pwa-install-dismissed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setInstallState('installed')
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setIsDismissed(true)
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
  }, [])

  // Don't show if dismissed, already installed, or no install option
  if (isDismissed || installState === 'installed' || installState === 'idle') {
    return null
  }

  // iOS Safari instructions
  if (installState === 'ios-safari') {
    return (
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 animate-slide-up">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
        
        <div className="flex items-start gap-3">
          <img 
            src="/pwa-icons/android/android-launchericon-96-96.png" 
            alt="PLAYR" 
            className="w-10 h-10 rounded-xl flex-shrink-0" 
          />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm">Install PLAYR</h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Add to your home screen for the best experience
            </p>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-100 rounded text-[10px] font-medium">1</span>
            Tap <Share className="w-4 h-4 text-blue-500 inline mx-1" /> Share
          </p>
          <p className="text-xs text-gray-600 flex items-center gap-2 mt-2">
            <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-100 rounded text-[10px] font-medium">2</span>
            Tap <Plus className="w-4 h-4 text-gray-700 inline mx-1" /> Add to Home Screen
          </p>
        </div>
      </div>
    )
  }

  // Standard install prompt (Chrome, Edge, Samsung, etc.)
  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 animate-slide-up">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded-full transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-gray-500" />
      </button>
      
      <div className="flex items-start gap-3">
        <img 
          src="/pwa-icons/android/android-launchericon-96-96.png" 
          alt="PLAYR" 
          className="w-10 h-10 rounded-xl flex-shrink-0" 
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm">Install PLAYR</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            Get quick access from your home screen
          </p>
        </div>
      </div>

      <button
        onClick={handleInstall}
        className="mt-3 w-full py-2.5 px-4 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
      >
        <Download className="w-4 h-4" />
        Install App
      </button>
    </div>
  )
}
