import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Conversation, Message } from '../../types';

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

const initialState: MessagesState = {
  conversations: [],
  messages: {},
  unreadCount: 0,
  isLoading: false,
  error: null,
};

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload;
      state.unreadCount = action.payload.reduce((sum, conv) => sum + conv.unreadCount, 0);
    },
    upsertConversation: (state, action: PayloadAction<Conversation>) => {
      const index = state.conversations.findIndex((conv) => conv.id === action.payload.id);
      if (index === -1) {
        state.conversations.unshift(action.payload);
      } else {
        state.conversations[index] = action.payload;
      }
      state.unreadCount = state.conversations.reduce((sum, conv) => sum + (conv.unreadCount ?? 0), 0);
    },
    setMessages: (
      state,
      action: PayloadAction<{ conversationId: string; messages: Message[] }>,
    ) => {
      state.messages[action.payload.conversationId] = action.payload.messages;
    },
    addMessage: (
      state,
      action: PayloadAction<{ conversationId: string; message: Message; isMine?: boolean }>,
    ) => {
      const { conversationId, message, isMine } = action.payload;
      if (!state.messages[conversationId]) {
        state.messages[conversationId] = [];
      }
      state.messages[conversationId].push(message);

      const convIndex = state.conversations.findIndex((c) => c.id === conversationId);
      if (convIndex !== -1) {
        const conversation = state.conversations[convIndex];
        state.conversations[convIndex] = {
          ...conversation,
          lastMessage: message,
          lastMessageAt: message.createdAt,
          unreadCount: isMine
            ? conversation.unreadCount
            : (conversation.unreadCount ?? 0) + 1,
        };
      }
      state.unreadCount = state.conversations.reduce((sum, conv) => sum + (conv.unreadCount ?? 0), 0);
    },
    markConversationMessagesRead: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const convIndex = state.conversations.findIndex((c) => c.id === conversationId);
      if (convIndex !== -1) {
        state.unreadCount -= state.conversations[convIndex].unreadCount ?? 0;
        state.conversations[convIndex].unreadCount = 0;
      }
      if (state.messages[conversationId]) {
        state.messages[conversationId] = state.messages[conversationId].map((msg) => ({
          ...msg,
          isRead: true,
          readAt: msg.readAt ?? new Date().toISOString(),
        }));
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
  },
});

export const {
  setConversations,
  upsertConversation,
  setMessages,
  addMessage,
  markConversationMessagesRead,
  setLoading,
  setError,
} = messagesSlice.actions;

export default messagesSlice.reducer;

