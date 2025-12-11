import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { registerSW } from 'virtual:pwa-register'
import './globals.css'
import App from './App.tsx'
import { initWebVitals } from './lib/monitor'
import { queryClient } from './lib/queryClient'

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(swScriptUrl, registration) {
      console.log('[PWA] Service Worker registered:', swScriptUrl)
      // Check for updates every hour
      if (registration) {
        setInterval(() => {
          registration.update()
        }, 60 * 60 * 1000)
      }
    },
    onOfflineReady() {
      console.log('[PWA] App is ready for offline use')
    },
    onNeedRefresh() {
      // Could show a toast here prompting user to refresh
      console.log('[PWA] New content available, refresh to update')
    },
    onRegisterError(error) {
      console.error('[PWA] Service Worker registration failed:', error)
    },
  })
}

const sentryEnvironment = import.meta.env.MODE === 'production' ? 'production' : 'development'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: Boolean(import.meta.env.VITE_SENTRY_DSN),
  environment: sentryEnvironment,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: sentryEnvironment === 'production' ? 0.3 : 1.0,
  replaysSessionSampleRate: sentryEnvironment === 'production' ? 0.05 : 1.0,
  replaysOnErrorSampleRate: 1.0,
})

const RootErrorFallback = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 text-center">
    <p className="text-lg font-semibold text-gray-800">Something went wrong.</p>
    <p className="text-sm text-gray-500">Our team has been notified via Sentry.</p>
  </div>
)

// Initialize Web Vitals tracking
initWebVitals()

export function RootApp() {
  return (
    <Sentry.ErrorBoundary fallback={<RootErrorFallback />}>
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </StrictMode>
    </Sentry.ErrorBoundary>
  )
}

createRoot(document.getElementById('root')!).render(<RootApp />)

export default RootApp
