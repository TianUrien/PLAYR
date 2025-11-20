import { useCallback } from 'react'
import * as Sentry from '@sentry/react'

const SentryTestButton = () => {
  if (import.meta.env.MODE === 'production') {
    return null
  }

  const triggerTestError = useCallback(() => {
    Sentry.captureMessage('Developer-triggered Sentry test event')
    throw new Error('Sentry test button error')
  }, [])

  return (
    <button
      type="button"
      onClick={triggerTestError}
      className="fixed bottom-4 right-4 rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm font-semibold text-red-600 shadow-lg backdrop-blur hover:bg-white"
    >
      Throw Sentry Test Error
    </button>
  )
}

export default SentryTestButton
