import { useUnreadMessages } from '@/hooks/useUnreadMessages'
import { useOpportunityNotifications } from '@/hooks/useOpportunityNotifications'

/**
 * NotificationBridge mounts once within the app shell so notification stores
 * stay initialized even when the header or bottom navigation are hidden.
 */
export default function NotificationBridge() {
  useUnreadMessages()
  useOpportunityNotifications()
  return null
}
