import { type ReactNode, useMemo } from 'react'
import { ShieldCheck, MessageCircle, Loader2 } from 'lucide-react'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'
import { cn } from '@/lib/utils'
import type { ReferenceCard, PublicReferenceCard } from '@/hooks/useTrustedReferences'

type ReferenceLike = Pick<ReferenceCard, 'id' | 'relationshipType' | 'endorsementText' | 'profile'>
  | Pick<PublicReferenceCard, 'id' | 'relationshipType' | 'endorsementText' | 'profile'>

interface TrustedReferenceCardProps {
  reference: ReferenceLike
  onMessage?: (profileId: string | null) => void
  messageLoading?: boolean
  disabled?: boolean
  className?: string
  layout?: 'grid' | 'carousel'
  endorsementFallback?: string
  secondaryAction?: ReactNode
  showShield?: boolean
  messageLabel?: string
  onOpenProfile?: (profileId: string | null, role?: string | null) => void
  /** Max characters for endorsement text (carousel only). Default: 180 */
  maxEndorsementLength?: number
}

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '…'
}

export default function TrustedReferenceCard({
  reference,
  onMessage,
  messageLoading = false,
  disabled = false,
  className,
  layout = 'grid',
  endorsementFallback = 'No written endorsement yet.',
  secondaryAction,
  showShield = true,
  messageLabel = 'Message',
  onOpenProfile,
  maxEndorsementLength = 180,
}: TrustedReferenceCardProps) {
  const profileName = reference.profile?.fullName ?? 'PLAYR Member'
  const profileInitials = reference.profile?.fullName?.slice(0, 2) ?? 'PM'
  const profileDetails = useMemo(() => {
    const { position, currentClub, baseLocation } = reference.profile ?? {}
    return position || currentClub || baseLocation || null
  }, [reference.profile])

  const messageDisabled = disabled || !reference.profile?.id || messageLoading
  const isCarousel = layout === 'carousel'
  const layoutClasses = isCarousel ? 'w-[300px] min-w-[300px] max-w-[300px] flex-shrink-0' : ''
  const canNavigateProfile = Boolean(onOpenProfile && reference.profile?.id)

  const endorsementCopy = useMemo(() => {
    const rawText = reference.endorsementText?.trim()
    if (!rawText) return endorsementFallback
    
    const quoted = `"${rawText}"`
    // Only truncate in carousel layout
    if (isCarousel && quoted.length > maxEndorsementLength) {
      return `"${truncateText(rawText, maxEndorsementLength - 3)}"`
    }
    return quoted
  }, [reference.endorsementText, endorsementFallback, isCarousel, maxEndorsementLength])

  const handleOpenProfile = () => {
    if (!canNavigateProfile) return
    onOpenProfile?.(reference.profile?.id ?? null, reference.profile?.role ?? undefined)
  }

  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-[26px] border border-[#f4d58a] bg-gradient-to-b from-white via-white to-[#fff9ef] p-5 text-slate-900 shadow-[0_30px_90px_rgba(248,196,105,0.28)] transition-transform hover:-translate-y-0.5',
        layoutClasses,
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[26px] border border-white/50" />
      <div className="flex items-start gap-4">
        {canNavigateProfile ? (
          <button
            type="button"
            onClick={handleOpenProfile}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
            aria-label={`View ${profileName}'s profile`}
          >
            <Avatar
              src={reference.profile?.avatarUrl}
              alt={profileName}
              initials={profileInitials}
              size="md"
              className="shadow-[0_10px_25px_rgba(15,23,42,0.15)]"
            />
          </button>
        ) : (
          <Avatar
            src={reference.profile?.avatarUrl}
            alt={profileName}
            initials={profileInitials}
            size="md"
            className="shadow-[0_10px_25px_rgba(15,23,42,0.15)]"
          />
        )}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              {canNavigateProfile ? (
                <button
                  type="button"
                  onClick={handleOpenProfile}
                  className="text-left text-base font-semibold text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
                >
                  {profileName}
                </button>
              ) : (
                <p className="text-base font-semibold text-slate-900">{profileName}</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <RoleBadge role={reference.profile?.role ?? undefined} className="px-2 py-0.5 text-[11px]" />
                <span className="font-medium text-slate-500">{reference.relationshipType}</span>
              </div>
            </div>
            {showShield && <ShieldCheck className="h-5 w-5 text-emerald-500" aria-hidden />}
          </div>
          {profileDetails && <p className="mt-2 text-sm font-medium text-slate-600">{profileDetails}</p>}
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-600 break-words whitespace-normal">{endorsementCopy}</p>

      {(secondaryAction || onMessage) && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {onMessage && (
            <button
              type="button"
              onClick={() => onMessage(reference.profile?.id ?? null)}
              disabled={messageDisabled}
              className="inline-flex items-center gap-2 rounded-full border border-transparent bg-gradient-to-r from-[#21c97a] to-[#14b869] px-5 py-2 text-sm font-semibold text-white shadow-[0_15px_35px_rgba(32,201,122,0.35)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {messageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              <span>{messageLoading ? 'Messaging…' : messageLabel}</span>
            </button>
          )}
          {secondaryAction}
        </div>
      )}
    </article>
  )
}
