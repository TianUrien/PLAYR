import { useCallback } from 'react'
import * as Sentry from '@sentry/react'

const SentryTestButton = () => {
  const isProduction =
    import.meta.env.MODE === 'production' ||
    import.meta.env.VITE_ENVIRONMENT === 'production'

  const triggerTestError = useCallback(() => {
    Sentry.captureMessage('Developer-triggered Sentry test event')
    throw new Error('Sentry test button error')
  }, [])

  if (isProduction) {
    return null
  }

  return (
    <button
      type="button"
      onClick={triggerTestError}
      className="pointer-events-auto fixed bottom-4 right-4 rounded-md border border-red-200 bg-white/90 px-4 py-2 text-sm font-semibold text-red-600 shadow-lg backdrop-blur hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    >
      Throw Sentry Test Error
    </button>
  )
}

export default SentryTestButton
