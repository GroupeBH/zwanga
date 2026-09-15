import { styles } from '../../features/screen-styles/app/chat/detail/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { trackEvent } from '@/services/analytics';
import { chatSocket } from '@/services/chatSocket';
import {
  messageApi,
  useDeleteConversationMessageMutation,
  useEditConversationMessageMutation,
  useGetConversationMessagesQuery,
  useGetConversationQuery,
  useMarkConversationAsReadMutation,
  useSendConversationMessageMutation,
} from '@/store/api/messageApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import {
  addMessage as addMessageAction,
  markConversationMessagesRead,
  upsertConversation,
} from '@/store/slices/messagesSlice';
import { Message } from '@/types';
import { openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const { id, title: initialTitle } = useLocalSearchParams<{ id?: string; title?: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const isScreenActive = useScreenIsActive();
  const [message, setMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const user = useAppSelector(selectUser);

  const { data: conversation, isLoading: conversationLoading, refetch: refetchConversation } = useGetConversationQuery(conversationId, {
    skip: !conversationId,
  });
  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages } = useGetConversationMessagesQuery(
    { conversationId },
    { skip: !conversationId || !isScreenActive, refetchOnMountOrArgChange: true, refetchOnReconnect: true },
  );
  const [sendMessageMutation, { isLoading: sending }] = useSendConversationMessageMutation();
  const [markConversationAsRead] = useMarkConversationAsReadMutation();
  const [editMessageMutation] = useEditConversationMessageMutation();
  const [deleteMessageMutation] = useDeleteConversationMessageMutation();

  const messages = useMemo(() => messagesData ?? [], [messagesData]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchConversation(),
        refetchMessages(),
      ]);
    } catch (error) {
      console.warn('Error refreshing chat data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refetchConversation, refetchMessages]);

  useEffect(() => {
    if (conversation) {
      dispatch(upsertConversation(conversation));
    }
  }, [conversation, dispatch]);

  useEffect(() => {
    if (conversationId && messagesData && isScreenActive) {
      dispatch(markConversationMessagesRead(conversationId));
    }
  }, [conversationId, dispatch, messagesData, isScreenActive]);

  useEffect(() => {
    if (conversationId && isScreenActive) {
      markConversationAsRead(conversationId);
    }
  }, [conversationId, isScreenActive, markConversationAsRead]);

  useEffect(() => {
    if (!isScreenActive) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let joined = false;

    const setupSocket = async () => {
      if (conversation?.bookingId) {
        await chatSocket.joinBookingRoom(conversation.bookingId);
        if (cancelled) {
          await chatSocket.leaveBookingRoom(conversation.bookingId);
          return;
        }
        joined = true;
      }

      if (cancelled) return;
      unsubscribe = chatSocket.subscribeToMessages((incoming) => {
        if (incoming.conversationId === conversationId) {
          dispatch(
            messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
              if (!draft.some((message) => message.id === incoming.id)) draft.push(incoming);
            }),
          );
          dispatch(
            addMessageAction({
              conversationId,
              message: incoming,
              isMine: incoming.senderId === user?.id,
            }),
          );
        }
      });
    };

    void setupSocket().catch((error) => {
      if (!cancelled) console.warn('[Chat] Connexion temps réel indisponible:', error);
    });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (joined && conversation?.bookingId) {
        chatSocket.leaveBookingRoom(conversation.bookingId);
      }
    };
  }, [conversation?.bookingId, conversationId, dispatch, user?.id, isScreenActive]);

  const handleSend = async () => {
    if (!message.trim() || !conversationId || sending) {
      return;
    }

    const content = message.trim();
    setMessage('');

    // Mode édition
    if (editingMessageId) {
      try {
        const updated = await editMessageMutation({ messageId: editingMessageId, content, conversationId }).unwrap();
        setEditingMessageId(null);
        dispatch(
          messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
            const index = draft.findIndex((m) => m.id === updated.id);
            if (index !== -1) {
              draft[index] = updated;
            }
          }),
        );
      } catch (error) {
        console.warn('Erreur lors de la modification du message:', error);
      }
      return;
    }

    // Mode envoi normal
    try {
      const saved = await sendMessageMutation({ conversationId, content }).unwrap();
      void trackEvent('message_sent', {
        conversation_id: conversationId,
        has_booking: Boolean(conversation?.bookingId),
        content_length: content.length,
      });
      dispatch(
        messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
          if (!draft.some((message) => message.id === saved.id)) draft.push(saved);
        }),
      );
      dispatch(
        addMessageAction({
          conversationId,
          message: saved,
          isMine: true,
        }),
      );
    } catch (error) {
      console.warn('Erreur lors de l\'envoi du message:', error);
      setMessage(content);
    }
  };

  const formatTime = (dateValue: string) => {
    const date = new Date(dateValue);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDate = (dateValue: string) => {
    const date = new Date(dateValue);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Aujourd\'hui';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    } else {
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
  };

  const counterpart = useMemo(() => {
    return conversation?.participants?.find((participant) => participant.userId !== user?.id)?.user;
  }, [conversation?.participants, user?.id]);

  const headerTitle =
    conversation?.title ||
    (counterpart ? `${counterpart.firstName ?? ''} ${counterpart.lastName ?? ''}`.trim() : initialTitle) ||
    'Conversation';

  const chatRows = useMemo(() => {
    const rows: ({ kind: 'date'; id: string; label: string } | { kind: 'message'; id: string; message: Message })[] = [];
    let previousDay = '';
    const unique = new Map(messages.map((item) => [item.id, item]));
    const ordered = [...unique.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    for (const item of ordered) {
      const day = new Date(item.createdAt).toDateString();
      if (day !== previousDay) {
        rows.push({ kind: 'date', id: `date:${day}`, label: formatDate(item.createdAt) });
        previousDay = day;
      }
      rows.push({ kind: 'message', id: item.id, message: item });
    }
    return rows.reverse();
  }, [messages]);

  const handleEditMessage = (msg: Message) => {
    if (msg.senderId !== user?.id) return;
    setEditingMessageId(msg.id);
    setMessage(msg.content);
  };

  const handleDeleteMessage = (msg: Message) => {
    if (msg.senderId !== user?.id) return;

    showDialog({
      title: 'Supprimer le message',
      message: 'Voulez-vous vraiment supprimer ce message ? Cette action est irréversible.',
      variant: 'danger',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'primary',
          onPress: async () => {
            try {
              await deleteMessageMutation({ messageId: msg.id, conversationId }).unwrap();
              dispatch(
                messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
                  const index = draft.findIndex((m) => m.id === msg.id);
                  if (index !== -1) {
                    draft.splice(index, 1);
                  }
                }),
              );
            } catch (error) {
              console.warn('Erreur lors de la suppression du message:', error);
            }
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <View style={styles.avatar} />
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{headerTitle}</Text>
              <View style={styles.userStatus}>
                <View style={styles.onlineDot} />
                <Text style={styles.userStatusText}>{conversationLoading ? 'Chargement…' : 'En ligne'}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.headerButton}
            disabled={!counterpart?.phone}
            onPress={async () => {
              if (counterpart?.phone) {
                await openWhatsApp(counterpart.phone, (errorMsg) => {
                  showDialog({
                    variant: 'danger',
                    title: 'Erreur',
                    message: errorMsg,
                  });
                });
              }
            }}
          >
            <Ionicons
              name="logo-whatsapp"
              size={20}
              color={counterpart?.phone ? '#25D366' : Colors.gray[400]}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <FlatList
          inverted
          data={chatRows}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          maxToRenderPerBatch={12}
          windowSize={7}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={messagesLoading ? <ActivityIndicator color={Colors.primary} /> : null}
          renderItem={({ item }) => {
            if (item.kind === 'date') {
              return <View style={styles.dateSeparator}><View style={styles.dateBadge}><Text style={styles.dateText}>{item.label}</Text></View></View>;
            }
            const msg = item.message;
            const isMe = msg.senderId === user?.id;
            return (
                  <View
                    key={msg.id}
                    style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onLongPress={() => {
                        if (!isMe) return;
                        showDialog({
                          title: 'Message',
                          actions: [
                            { label: 'Annuler', variant: 'ghost' },
                            { label: 'Modifier', onPress: () => handleEditMessage(msg) },
                            {
                              label: 'Supprimer',
                              variant: 'primary',
                              onPress: () => handleDeleteMessage(msg),
                            },
                          ],
                        });
                      }}
            >
              <View
                style={[
                  styles.messageBubble,
                        isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                ]}
              >
                      <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{msg.content}</Text>
                <View style={styles.messageFooter}>
                        <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>
                          {formatTime(msg.createdAt)}
                  </Text>
                        {isMe && (
                    <Ionicons
                            name={msg.isRead ? 'checkmark-done' : 'checkmark'}
                      size={14}
                      color={Colors.white}
                      style={styles.checkIcon}
                    />
                  )}
                </View>
              </View>
                    </TouchableOpacity>
                  </View>
            );
          }}
        />

        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.inputButton}>
              <Ionicons name="add" size={24} color={Colors.gray[600]} />
            </TouchableOpacity>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="Message..."
                placeholderTextColor={Colors.gray[500]}
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
              />
              <TouchableOpacity style={styles.emojiButton}>
                <Ionicons name="happy-outline" size={24} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.sendButton, message.trim() && styles.sendButtonActive]}
              onPress={handleSend}
              disabled={!message.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
              <Ionicons
                name="send"
                size={20}
                color={message.trim() ? Colors.white : Colors.gray[600]}
              />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


