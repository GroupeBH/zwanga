import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Conversation, Message } from '../../types';

interface MessagesState {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  unreadCount: number;
  knownUnreadCounts: Record<string, number>;
  isLoading: boolean;
  error: string | null;
}

const initialState: MessagesState = {
  conversations: [],
  messages: {},
  unreadCount: 0,
  knownUnreadCounts: {},
  isLoading: false,
  error: null,
};

// Keep only unread counters outside the visible window, never historical message bodies.
function rememberUnread(state: MessagesState, id: string, count: number) {
  const previous = state.knownUnreadCounts[id] ?? 0;
  const next = Number.isFinite(count) ? Math.max(0, count) : 0;
  if (next > 0) state.knownUnreadCounts[id] = next;
  else delete state.knownUnreadCounts[id];
  state.unreadCount += next - previous;
}

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    resetMessages: () => initialState,
    setConversations: (state, action: PayloadAction<Conversation[]>) => {
      state.conversations = action.payload;
      state.knownUnreadCounts = {};
      state.unreadCount = 0;
      for (const row of action.payload) rememberUnread(state, row.id, row.unreadCount ?? 0);
    },
    setConversationWindow: (state, action: PayloadAction<{ conversations: Conversation[]; complete: boolean }>) => {
      state.conversations = action.payload.conversations;
      if (action.payload.complete) { state.knownUnreadCounts = {}; state.unreadCount = 0; }
      for (const row of action.payload.conversations) rememberUnread(state, row.id, row.unreadCount ?? 0);
    },
    forgetConversation: (state, action: PayloadAction<string>) => {
      state.conversations = state.conversations.filter(row => row.id !== action.payload);
      rememberUnread(state, action.payload, 0);
    },
    upsertConversation: (state, action: PayloadAction<Conversation>) => {
      const index = state.conversations.findIndex((conv) => conv.id === action.payload.id);
      if (index === -1) {
      state.conversations.unshift(action.payload);
      } else {
        state.conversations[index] = action.payload;
      }
      rememberUnread(state, action.payload.id, action.payload.unreadCount ?? 0);
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
      // Message bodies live in RTK Query, with eviction when the chat is closed.
      
      const convIndex = state.conversations.findIndex((c) => c.id === conversationId);
      if (convIndex !== -1) {
        const conversation = state.conversations[convIndex];
        if (conversation.lastMessage?.id === message.id) return;
        state.conversations[convIndex] = {
          ...conversation,
          lastMessage: message,
          lastMessageAt: message.createdAt,
          unreadCount: isMine
            ? conversation.unreadCount
            : (conversation.unreadCount ?? 0) + 1,
        };
        rememberUnread(state, conversationId, state.conversations[convIndex].unreadCount ?? 0);
      }
    },
    markConversationMessagesRead: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const convIndex = state.conversations.findIndex((c) => c.id === conversationId);
      if (convIndex !== -1) {
        state.conversations[convIndex].unreadCount = 0;
      }
      rememberUnread(state, conversationId, 0);
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
  resetMessages,
  setConversations,
  setConversationWindow,
  forgetConversation,
  upsertConversation,
  setMessages,
  addMessage,
  markConversationMessagesRead,
  setLoading,
  setError,
} = messagesSlice.actions;

export default messagesSlice.reducer;

