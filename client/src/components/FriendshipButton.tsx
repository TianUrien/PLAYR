import { Check, Loader2, Shield, UserMinus, UserPlus, UserX, Clock } from 'lucide-react'
import { useFriendship } from '@/hooks/useFriendship'
import { useToastStore } from '@/lib/toast'
import { cn } from '@/lib/utils'

interface FriendshipButtonProps {
  profileId: string
  className?: string
}

export default function FriendshipButton({ profileId, className }: FriendshipButtonProps) {
  const { addToast } = useToastStore()
  const {
    loading,
    mutating,
    isAuthenticated,
    isOwnProfile,
    isFriend,
    isIncomingRequest,
    isOutgoingRequest,
    status,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    removeFriend,
  } = useFriendship(profileId)

  if (isOwnProfile) return null

  const handleAuthRequired = () => {
    addToast('Sign in with your PLAYR profile to manage connections.', 'error')
  }

  const renderPendingActions = () => {
    if (isIncomingRequest) {
      return (
        <div className={cn('flex flex-wrap gap-2', className)}>
          <button
            type="button"
            disabled={mutating}
            onClick={() => void acceptRequest()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Accept
          </button>
          <button
            type="button"
            disabled={mutating}
            onClick={() => void rejectRequest()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
            Decline
          </button>
        </div>
      )
    }

    if (isOutgoingRequest) {
      return (
        <div className={cn('flex flex-wrap gap-2', className)}>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600"
          >
            <Clock className="h-4 w-4" />
            Request Sent
          </button>
          <button
            type="button"
            disabled={mutating}
            onClick={() => void cancelRequest()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
            Cancel
          </button>
        </div>
      )
    }

    return null
  }

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className={cn('inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600', className)}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking...
      </button>
    )
  }

  if (!isAuthenticated) {
    return (
      <button
        type="button"
        onClick={handleAuthRequired}
        className={cn('inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50', className)}
      >
        <UserPlus className="h-4 w-4" />
        Add Friend
      </button>
    )
  }

  if (isFriend) {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" />
          Friends
        </span>
        <button
          type="button"
          disabled={mutating}
          onClick={() => void removeFriend()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
          Remove
        </button>
      </div>
    )
  }

  const pendingActions = renderPendingActions()
  if (pendingActions) {
    return pendingActions
  }

  if (status === 'blocked') {
    return (
      <span className={cn('inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700', className)}>
        <Shield className="h-4 w-4" />
        Blocked
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={mutating}
      onClick={() => void sendRequest()}
      className={cn('inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60', className)}
    >
      {mutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      Add Friend
    </button>
  )
}
