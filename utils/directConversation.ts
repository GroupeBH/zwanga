import type { Conversation } from '@/types';

export const getConversationSortTime = (conversation: Conversation) => {
  const rawValue = conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt;
  const timestamp = rawValue ? new Date(rawValue).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const findDirectConversationWithUser = (
  conversations: Conversation[] | undefined,
  currentUserId: string,
  otherUserId: string,
) => {
  const matches = (conversations ?? [])
    .filter((conversation) => {
      const participantIds = new Set(conversation.participants?.map(participant => participant.userId).filter(Boolean));
      return participantIds.size === 2 && participantIds.has(currentUserId) && participantIds.has(otherUserId);
    })
    .sort((a, b) => getConversationSortTime(b) - getConversationSortTime(a));
  return matches.find(conversation => !conversation.bookingId) ?? matches[0] ?? null;
};
