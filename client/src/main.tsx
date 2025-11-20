import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './globals.css'
import App from './App.tsx'
import { initWebVitals } from './lib/monitor'

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

createRoot(document.getElementById('root')!).render(
  <Sentry.ErrorBoundary fallback={<RootErrorFallback />}>
    <StrictMode>
      <App />
    </StrictMode>
  </Sentry.ErrorBoundary>,
)
