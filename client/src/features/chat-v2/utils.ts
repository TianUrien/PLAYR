import type { ConversationParticipant } from '@/types/chat'

export const buildPublicProfilePath = (participant?: ConversationParticipant | null) => {
  if (!participant) return null
  const slug = participant.username ? participant.username : `id/${participant.id}`
  return participant.role === 'club' ? `/clubs/${slug}` : `/players/${slug}`
}
