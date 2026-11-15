// Morse Messenger — shared types between API and client

export interface UserDTO {
  id: string
  displayName: string
  avatarColor: string
}

export interface SettingsDTO {
  language: 'en' | 'hi'
  readReceipts: boolean
  soundEnabled: boolean
  vibrationEnabled: boolean
  wpm: number
  frequency: number
  volume: number
}

export type MessageKind = 'text' | 'morse' | 'system'
export type SendMode = 'text' | 'morse' | 'dual'
export type PlayMode = 'sound' | 'light' | 'vibration'
export type ChatDisplayMode = 'text' | 'morse' | 'dual'

export interface MessageDTO {
  id: string
  conversationId: string
  kind: MessageKind
  text: string
  morse: string | null
  sendMode: SendMode | null
  playMode: PlayMode | null
  /** E2EE (beta): text holds ciphertext; clients decrypt locally */
  encrypted: boolean
  senderId: string
  senderName: string
  senderColor: string
  replyToId: string | null
  replyTo?: { id: string; text: string; senderName: string } | null
  createdAt: string
  editedAt: string | null
  /** recipient receipt status (only meaningful for my own messages) */
  delivered: boolean
  read: boolean
}

export interface ConversationDTO {
  id: string
  /** null for group conversations */
  peer: UserDTO | null
  isGroup: boolean
  name: string | null
  members: UserDTO[]
  myRole: 'owner' | 'member'
  e2eeEnabled: boolean
  createdAt: string
  updatedAt: string
  lastMessage: {
    id: string
    kind: MessageKind
    text: string
    morse: string | null
    encrypted: boolean
    senderId: string
    createdAt: string
  } | null
  unreadCount: number
  blockedByMe: boolean
  blockedMe: boolean
  pinned: boolean
  muted: boolean
  myDisplayMode: ChatDisplayMode
}

export interface SearchHitDTO {
  conversationId: string
  messageId: string
  text: string
  senderId: string
  senderName: string
  createdAt: string
  convTitle: string
}

export interface InvitationDTO {
  id: string
  code: string
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  createdAt: string
  expiresAt: string
  creator?: UserDTO
  acceptedBy?: UserDTO | null
  conversationId?: string | null
}

export interface LearnProgressDTO {
  character: string
  correct: number
  wrong: number
}

export interface LearnStateDTO {
  progress: LearnProgressDTO[]
  streak: number
  practicedToday: number
  /** last 14 days ascending: [{date: 'yyyy-mm-dd', count}] */
  history: { date: string; count: number }[]
}

export interface SocketEmitPayload {
  room: string
  event: string
  data: unknown
}
