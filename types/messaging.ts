export interface BasicUserInfo {
  id: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string | null;
  phone?: string;
}

export interface ConversationParticipant {
  id: string;
  conversationId?: string;
  userId: string;
  user: BasicUserInfo | null;
  lastReadAt?: string | null;
  isMuted: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  bookingId?: string | null;
  senderId: string;
  sender?: BasicUserInfo | null;
  content: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  title?: string | null;
  bookingId?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
  lastMessage?: Message | null;
  unreadCount: number;
}
