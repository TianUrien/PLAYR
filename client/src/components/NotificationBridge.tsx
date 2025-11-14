import { useEffect } from 'react'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'
import { useOpportunityNotifications } from '@/hooks/useOpportunityNotifications'
import { useAuthStore } from '@/lib/auth'
import { useNotificationStore } from '@/lib/notifications'

/**
 * NotificationBridge mounts once within the app shell so notification stores
 * stay initialized even when the header or bottom navigation are hidden.
 */
export default function NotificationBridge() {
  useUnreadMessages()
  useOpportunityNotifications()
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const initializeNotifications = useNotificationStore((state) => state.initialize)

  useEffect(() => {
    void initializeNotifications(userId)
  }, [initializeNotifications, userId])
  return null
}
