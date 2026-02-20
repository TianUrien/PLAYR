import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { logger } from '@/lib/logger'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Convert a URL-safe base64 string to a Uint8Array (applicationServerKey format) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushSubscription() {
  const { user } = useAuthStore()
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY

  // Check current subscription state on mount and when user changes
  useEffect(() => {
    if (!isSupported || !user) {
      setIsSubscribed(false)
      return
    }

    let cancelled = false

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        if (!cancelled) {
          setIsSubscribed(!!sub)
        }
      })
    })

    return () => { cancelled = true }
  }, [isSupported, user])

  // Sync permission state when it might change
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
    }
  }, [isSubscribed])

  const subscribe = useCallback(async () => {
    if (!isSupported || !user || !VAPID_PUBLIC_KEY) return

    setLoading(true)
    try {
      // Request permission
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result !== 'granted') {
        logger.info('[Push] Permission denied by user')
        return
      }

      // Subscribe via PushManager
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      // Extract keys
      const subJson = subscription.toJSON()
      const endpoint = subscription.endpoint
      const p256dh = subJson.keys?.p256dh
      const auth = subJson.keys?.auth

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Invalid push subscription: missing keys')
      }

      // Upsert to database
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            profile_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
          },
          { onConflict: 'profile_id,endpoint' }
        )

      if (error) throw error

      setIsSubscribed(true)
      logger.info('[Push] Subscribed successfully')
    } catch (err) {
      logger.error('[Push] Subscribe failed:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isSupported, user])

  const unsubscribe = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      // Unsubscribe from PushManager
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()

        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('profile_id', user.id)
          .eq('endpoint', endpoint)
      }

      setIsSubscribed(false)
      logger.info('[Push] Unsubscribed successfully')
    } catch (err) {
      logger.error('[Push] Unsubscribe failed:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user])

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  }
}
