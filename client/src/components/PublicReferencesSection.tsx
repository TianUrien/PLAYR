import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TrustedReferenceCard from './TrustedReferenceCard'
import { useTrustedReferences } from '@/hooks/useTrustedReferences'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import { supabase } from '@/lib/supabase'

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
  const primaryName = profileName?.split(' ')[0]?.trim() || null

  if (!profileId) return null

  const handleMessage = async (targetId: string | null) => {
    if (!targetId) return

    if (!user) {
      addToast('Sign in to message references.', 'info')
      navigate('/sign-in')
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
      console.error('Failed to open messages', error)
      addToast('Unable to start conversation. Please try again.', 'error')
    } finally {
      setMessageTarget(null)
    }
  }

  const renderSkeleton = () => (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, idx) => (
        <div key={idx} className="rounded-2xl border border-gray-100 bg-white/80 p-4 shadow-sm animate-pulse">
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
    <div className="grid gap-4 md:grid-cols-2">
      {acceptedReferences.map((reference) => (
        <TrustedReferenceCard
          key={reference.id}
          reference={reference}
          onMessage={handleMessage}
          messageLoading={messageTarget === reference.profile?.id}
          endorsementFallback="No written endorsement yet."
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
  )

  return (
    <section className="space-y-4 rounded-[30px] border border-slate-200 bg-white/95 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Trusted References</p>
        <h3 className="text-xl font-bold text-gray-900">{primaryName ? `${primaryName}'s trusted circle` : 'Trusted circle'}</h3>
        <p className="text-sm text-gray-600">Direct contacts who agreed to vouch for this profile.</p>
      </header>

      {loading ? renderSkeleton() : acceptedReferences.length === 0 ? renderEmpty() : renderReferences()}
    </section>
  )
}
