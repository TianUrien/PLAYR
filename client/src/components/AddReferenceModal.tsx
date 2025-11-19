import { useId, useMemo, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import Modal from './Modal'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'
import { cn } from '@/lib/utils'

export type ReferenceFriendOption = {
  id: string
  fullName: string
  username: string | null
  avatarUrl: string | null
  role: string | null
  baseLocation: string | null
  currentClub: string | null
}

const RELATIONSHIP_OPTIONS = [
  'Teammate',
  'Head Coach',
  'Assistant Coach',
  'Club Manager',
  'National Team Coach',
  'Mentor',
]

interface AddReferenceModalProps {
  isOpen: boolean
  onClose: () => void
  friends: ReferenceFriendOption[]
  onSubmit: (payload: { referenceId: string; relationshipType: string; requestNote?: string | null }) => Promise<boolean>
  isSubmitting: boolean
  remainingSlots: number
}

export default function AddReferenceModal({ isOpen, onClose, friends, onSubmit, isSubmitting, remainingSlots }: AddReferenceModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFriendId, setSelectedFriendId] = useState<string>('')
  const [relationshipType, setRelationshipType] = useState(RELATIONSHIP_OPTIONS[0]!)
  const [requestNote, setRequestNote] = useState('')
  const relationshipSelectId = useId()

  const filteredFriends = useMemo(() => {
    if (!searchTerm) return friends
    const term = searchTerm.toLowerCase()
    return friends.filter((friend) => {
      const haystacks = [friend.fullName, friend.username, friend.baseLocation, friend.currentClub]
      return haystacks.some((value) => value?.toLowerCase().includes(term))
    })
  }, [friends, searchTerm])

  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId) ?? null

  const resetState = () => {
    setSearchTerm('')
    setSelectedFriendId('')
    setRelationshipType(RELATIONSHIP_OPTIONS[0]!)
    setRequestNote('')
  }

  const handleClose = () => {
    if (isSubmitting) return
    resetState()
    onClose()
  }

  const handleSubmit = async () => {
    if (!selectedFriendId || !relationshipType) return
    const success = await onSubmit({
      referenceId: selectedFriendId,
      relationshipType,
      requestNote: requestNote.trim() ? requestNote.trim() : null,
    })

    if (success) {
      resetState()
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-3xl">
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-playr-primary">Add Reference</p>
            <h2 className="text-2xl font-bold text-gray-900">Choose a trusted connection</h2>
            <p className="mt-1 text-sm text-gray-500">Select up to five people who can vouch for you. {remainingSlots} {remainingSlots === 1 ? 'spot' : 'spots'} left.</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{remainingSlots} / 5 available</div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 1</p>
              <h3 className="text-lg font-semibold text-gray-900">Select a connection</h3>
              <p className="text-sm text-gray-500">Only accepted friends can become references.</p>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, club, or location"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm placeholder:text-gray-400 focus:border-playr-primary focus:bg-white focus:outline-none"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search connections"
              />
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white shadow-inner">
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {filteredFriends.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">No matching connections.</div>
                ) : (
                  filteredFriends.map((friend) => {
                    const isSelected = friend.id === selectedFriendId
                    return (
                      <button
                        type="button"
                        key={friend.id}
                        onClick={() => setSelectedFriendId(friend.id)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                          isSelected ? 'bg-emerald-50/60' : 'hover:bg-gray-50'
                        )}
                      >
                        <Avatar
                          src={friend.avatarUrl}
                          initials={friend.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?'}
                          alt={friend.fullName}
                          size="sm"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900">{friend.fullName}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                            <RoleBadge role={friend.role ?? undefined} />
                            {friend.currentClub && <span>{friend.currentClub}</span>}
                            {!friend.currentClub && friend.baseLocation && <span>{friend.baseLocation}</span>}
                          </div>
                        </div>
                        {isSelected && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Selected</span>}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Step 2</p>
              <h3 className="text-lg font-semibold text-gray-900">Describe the relationship</h3>
              <p className="text-sm text-gray-500">Provide a quick context so they know how to respond.</p>
            </div>

            <div className="space-y-3">
              <label htmlFor={relationshipSelectId} className="text-sm font-medium text-gray-700">Relationship type</label>
              <select
                id={relationshipSelectId}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-playr-primary focus:outline-none"
                value={relationshipType}
                onChange={(event) => setRelationshipType(event.target.value)}
              >
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Add a note (optional)</label>
              <textarea
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                placeholder="Give them context for the request."
                rows={6}
                className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-playr-primary focus:outline-none"
                maxLength={600}
              />
              <p className="text-right text-xs text-gray-400">{requestNote.length}/600</p>
            </div>

            <button
              type="button"
              disabled={!selectedFriend || !relationshipType || isSubmitting}
              onClick={handleSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-opacity disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {isSubmitting ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
