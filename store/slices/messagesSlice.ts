import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Conversation, Message } from '../../types';

interface MessagesState {
  conversations: Conversation[];
  messages: { [conversationId: string]: Message[] };
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
}

const initialState: MessagesState = {
  conversations: [
    {
      id: '1',
      userId: '123',
      userName: 'Jean Mukendi',
      lastMessage: 'Rendez-vous au rond-point ?',
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      unreadCount: 2,
    },
    {
      id: '2',
      userId: '456',
      userName: 'Marie Kabongo',
      lastMessage: "J'arrive dans 5 minutes",
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      unreadCount: 1,
    },
  ],
  messages: {
    '123': [
      {
        id: '1',
        userId: '123',
        userName: 'Jean Mukendi',
        text: 'Bonjour! Je suis intéressé par votre trajet.',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: true,
      },
      {
        id: '2',
        userId: 'me',
        userName: 'Moi',
        text: 'Bonjour! Pas de problème, il reste des places.',
        timestamp: new Date(Date.now() - 3500000).toISOString(),
        read: true,
      },
    ],
  },
  unreadCount: 3,
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
    addConversation: (state, action: PayloadAction<Conversation>) => {
      state.conversations.unshift(action.payload);
      state.unreadCount += action.payload.unreadCount;
    },
    updateConversation: (state, action: PayloadAction<{ id: string; updates: Partial<Conversation> }>) => {
      const index = state.conversations.findIndex(conv => conv.id === action.payload.id);
      if (index !== -1) {
        const oldUnread = state.conversations[index].unreadCount;
        state.conversations[index] = { ...state.conversations[index], ...action.payload.updates };
        const newUnread = state.conversations[index].unreadCount;
        state.unreadCount = state.unreadCount - oldUnread + newUnread;
      }
    },
    setMessages: (state, action: PayloadAction<{ conversationId: string; messages: Message[] }>) => {
      state.messages[action.payload.conversationId] = action.payload.messages;
    },
    addMessage: (state, action: PayloadAction<{ conversationId: string; message: Message }>) => {
      const { conversationId, message } = action.payload;
      if (!state.messages[conversationId]) {
        state.messages[conversationId] = [];
      }
      state.messages[conversationId].push(message);
      
      // Update conversation
      const convIndex = state.conversations.findIndex(c => c.userId === conversationId);
      if (convIndex !== -1) {
        state.conversations[convIndex].lastMessage = message.text;
        state.conversations[convIndex].timestamp = message.timestamp;
        if (!message.read && message.userId !== 'me') {
          state.conversations[convIndex].unreadCount += 1;
          state.unreadCount += 1;
        }
      }
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const conversationId = action.payload;
      const convIndex = state.conversations.findIndex(c => c.userId === conversationId);
      if (convIndex !== -1) {
        state.unreadCount -= state.conversations[convIndex].unreadCount;
        state.conversations[convIndex].unreadCount = 0;
      }
      
      // Mark all messages as read
      if (state.messages[conversationId]) {
        state.messages[conversationId].forEach(msg => {
          msg.read = true;
        });
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
  addConversation,
  updateConversation,
  setMessages,
  addMessage,
  markAsRead,
  setLoading,
  setError,
} = messagesSlice.actions;

export default messagesSlice.reducer;

