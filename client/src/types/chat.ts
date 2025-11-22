export type NullableDate = string | null

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed'

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  sent_at: string
  read_at: NullableDate
}

export interface ChatMessage extends Message {
  client_generated_id?: string
  status?: MessageDeliveryStatus
  error?: string | null
}

export interface ConversationParticipant {
  id: string
  full_name: string
  username: string | null
  avatar_url: string | null
  role: 'player' | 'coach' | 'club'
}

export interface Conversation {
  id: string
  participant_one_id: string
  participant_two_id: string
  created_at: string
  updated_at: string
  last_message_at: NullableDate
  otherParticipant?: ConversationParticipant
  isPending?: boolean
}

export type ChatMessageEvent =
  | {
      type: 'sent'
      conversationId: string
      message: Message
    }
  | {
      type: 'received'
      conversationId: string
      message: Message
    }
  | {
      type: 'read'
      conversationId: string
      messageIds: string[]
    }
