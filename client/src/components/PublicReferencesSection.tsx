import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import TrustedReferenceCard from './TrustedReferenceCard'
import { useTrustedReferences } from '@/hooks/useTrustedReferences'
import { useAuthStore } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { useToastStore } from '@/lib/toast'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface PublicReferencesSectionProps {
  profileId: string
  profileName?: string | null
}

export default function PublicReferencesSection({ profileId, profileName }: PublicReferencesSectionProps) {
  const { acceptedReferences, loading } = useTrustedReferences(profileId)
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const navigate = useNavigate()
  const [messageTarget, setMessageTarget] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const primaryName = profileName?.split(' ')[0]?.trim() || null

  const updateScrollButtons = () => {
    const container = scrollContainerRef.current
    if (!container) return
    setCanScrollLeft(container.scrollLeft > 0)
    setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth - 1)
  }

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current
    if (!container) return
    const scrollAmount = 300
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  if (!profileId) return null

  const handleMessage = async (targetId: string | null) => {
    if (!targetId) return

    if (!user) {
      addToast('Sign in to message PLAYR members.', 'info')
      navigate('/')
      return
    }

    setMessageTarget(targetId)
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_one_id.eq.${user.id},participant_two_id.eq.${targetId}),and(participant_one_id.eq.${targetId},participant_two_id.eq.${user.id})`
        )
        .maybeSingle()

      if (error) throw error

      if (data?.id) {
        navigate(`/messages?conversation=${data.id}`)
      } else {
        navigate(`/messages?new=${targetId}`)
      }
    } catch (error) {
      logger.error('Failed to open messages', error)
      addToast('Unable to start conversation. Please try again.', 'error')
    } finally {
      setMessageTarget(null)
    }
  }

  const renderSkeleton = () => (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="min-w-[280px] flex-shrink-0 rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/2 rounded bg-gray-200" />
              <div className="h-3 w-1/3 rounded bg-gray-200" />
            </div>
          </div>
          <div className="mt-4 h-3 w-3/4 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-full rounded bg-gray-100" />
        </div>
      ))}
    </div>
  )

  const renderEmpty = () => (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/80 p-6 text-center">
      <p className="text-sm text-gray-600">
        {primaryName ? `${primaryName} hasn't published any trusted references yet.` : 'No trusted references yet.'}
      </p>
    </div>
  )

  const renderReferences = () => (
    <div className="relative">
      {/* Scroll buttons - hidden on mobile, visible on desktop when scrollable */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scroll('left')}
          className="absolute -left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-gray-200 bg-white p-2 shadow-lg transition hover:bg-gray-50 md:flex"
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scroll('right')}
          className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full border border-gray-200 bg-white p-2 shadow-lg transition hover:bg-gray-50 md:flex"
          aria-label="Scroll right"
        >
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
      )}

      {/* Horizontal scrollable container */}
      <div
        ref={scrollContainerRef}
        onScroll={updateScrollButtons}
        onLoad={updateScrollButtons}
        className={cn(
          'flex gap-3 overflow-x-auto pb-2 scrollbar-hide',
          'snap-x snap-mandatory scroll-smooth',
          '-mx-1 px-1' // Minimal edge peek
        )}
      >
        {acceptedReferences.map((reference) => (
          <TrustedReferenceCard
            key={reference.id}
            reference={reference}
            layout="carousel"
            onMessage={handleMessage}
            messageLoading={messageTarget === reference.profile?.id}
            endorsementFallback="No written endorsement yet."
            className="snap-start"
            onOpenProfile={(id, role) => {
              if (!id) return
              if (role === 'club') {
                navigate(`/clubs/id/${id}`)
              } else {
                navigate(`/players/id/${id}`)
              }
            }}
          />
        ))}
      </div>

      {/* Scroll indicator dots for mobile */}
      {acceptedReferences.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 md:hidden">
          {acceptedReferences.map((_, idx) => (
            <div
              key={idx}
              className="h-1.5 w-1.5 rounded-full bg-gray-300"
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm sm:p-5">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Trusted References</p>
        <h3 className="text-xl font-bold text-gray-900">{primaryName ? `${primaryName}'s trusted circle` : 'Trusted circle'}</h3>
        <p className="text-sm text-gray-600">Direct contacts who agreed to vouch for this profile.</p>
      </header>

      {loading ? renderSkeleton() : acceptedReferences.length === 0 ? renderEmpty() : renderReferences()}
    </section>
  )
}
