import { useChatSendMessage } from '../../hooks/chat/useChatSendMessage';
import { useChatMessageActions } from '../../hooks/chat/useChatMessageActions';
import { ChatMessageList } from '@/components/chat/ChatMessageList';
import { styles } from '../../features/screen-styles/app/chat/detail/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors } from '@/constants/styles';
import { useChatExit } from '@/hooks/chat/useChatExit';
import { useChatRealtime } from '@/hooks/chat/useChatRealtime';
import {
  useDeleteConversationMessageMutation,
  useEditConversationMessageMutation,
  useGetConversationMessagePagesInfiniteQuery,
  useGetConversationQuery,
  useMarkConversationAsReadMutation,
  useSendConversationMessageMutation,
} from '@/store/api/messageApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import {
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
  const { leaving, goBack, isCurrent } = useChatExit(conversationId, isScreenActive, router);
  const chatActive = isScreenActive && !leaving;
  const [message, setMessage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const user = useAppSelector(selectUser);

  const { data: conversation, isLoading: conversationLoading, refetch: refetchConversation } = useGetConversationQuery(conversationId, {
    skip: !conversationId || !chatActive,
  });
  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages,
    hasNextPage, fetchNextPage, isFetchingNextPage, isError: messagesError,
    hasPreviousPage, fetchPreviousPage, isFetchingPreviousPage, isFetching: messagesFetching,
  } = useGetConversationMessagePagesInfiniteQuery(
    { conversationId },
    { skip: !conversationId || !chatActive, refetchOnMountOrArgChange: 30, refetchOnReconnect: true },
  );
  const [sendMessageMutation, { isLoading: sending }] = useSendConversationMessageMutation();
  const [markConversationAsRead] = useMarkConversationAsReadMutation();
  const [editMessageMutation] = useEditConversationMessageMutation();
  const [deleteMessageMutation] = useDeleteConversationMessageMutation();

  const messages = useMemo(() => {
    const seen = new Set<string>();
    return (messagesData?.pages ?? []).flatMap(page => page.data).filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id); return true;
    });
  }, [messagesData]);
  const loadOlder = useCallback(() => {
    if (isCurrent() && hasNextPage && !messagesFetching) void fetchNextPage();
  }, [isCurrent, hasNextPage, messagesFetching, fetchNextPage]);
  const needsHeadReload = Boolean(messagesData?.pages[0]?.needsHeadReload);
  const loadNewer = useCallback(() => {
    if (!isCurrent() || messagesFetching) return;
    if (needsHeadReload) void refetchMessages();
    else if (hasPreviousPage) void fetchPreviousPage();
  }, [isCurrent, hasPreviousPage, messagesFetching, fetchPreviousPage, needsHeadReload, refetchMessages]);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!isCurrent()) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refetchConversation(),
        refetchMessages(),
      ]);
    } catch (error) {
      console.warn('Error refreshing chat data:', error);
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  }, [refetchConversation, refetchMessages, isCurrent]);

  useEffect(() => { if (!chatActive) setRefreshing(false); }, [chatActive]);

  useEffect(() => {
    if (conversation && chatActive) {
      dispatch(upsertConversation(conversation));
    }
  }, [conversation, dispatch, chatActive]);

  useEffect(() => {
    if (conversationId && messagesData && chatActive) {
      dispatch(markConversationMessagesRead(conversationId));
    }
  }, [conversationId, dispatch, messagesData, chatActive]);

  useEffect(() => {
    if (conversationId && chatActive) {
      markConversationAsRead(conversationId);
    }
  }, [conversationId, chatActive, markConversationAsRead]);

  useChatRealtime({ enabled: chatActive, conversationId, bookingId: conversation?.bookingId,
    userId: user?.id, dispatch, isCurrent });

  const { handleSend } = useChatSendMessage({
    message,
    conversationId,
    sending,
    setMessage,
    editingMessageId,
    editMessageMutation,
    setEditingMessageId,
    dispatch,
    sendMessageMutation,
    conversation,
    isCurrent,
  });

  const counterpart = useMemo(() => {
    return conversation?.participants?.find((participant) => participant.userId !== user?.id)?.user;
  }, [conversation?.participants, user?.id]);

  const headerTitle =
    conversation?.title ||
    (counterpart ? `${counterpart.firstName ?? ''} ${counterpart.lastName ?? ''}`.trim() : initialTitle) ||
    'Conversation';

  const { handleEditMessage, handleDeleteMessage } = useChatMessageActions({
    user,
    setEditingMessageId,
    setMessage,
    showDialog,
    deleteMessageMutation,
    conversationId,
    dispatch,
    isCurrent,
  });

  const onMessageActions = useCallback((msg: Message) => {
    if (!isCurrent() || msg.senderId !== user?.id) return;
    showDialog({ title: 'Message', actions: [
      { label: 'Annuler', variant: 'ghost' },
      { label: 'Modifier', onPress: () => handleEditMessage(msg) },
      { label: 'Supprimer', variant: 'primary', onPress: () => handleDeleteMessage(msg) },
    ] });
  }, [isCurrent, user?.id, showDialog, handleEditMessage, handleDeleteMessage]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={goBack} disabled={leaving} accessibilityLabel="Retour aux conversations" style={styles.backButton}>
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
        enabled={chatActive}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        {chatActive && <ChatMessageList
          messages={messages} userId={user?.id} loading={messagesLoading}
          refreshing={refreshing} onRefresh={onRefresh} onMessageActions={onMessageActions}
          newestFirst hasOlder={hasNextPage} loadingOlder={isFetchingNextPage}
          hasNewer={hasPreviousPage || needsHeadReload} loadingNewer={isFetchingPreviousPage || (needsHeadReload && messagesFetching)} onLoadNewer={loadNewer}
          olderError={messagesError && Boolean(messagesData?.pages.length)} onLoadOlder={loadOlder} error={messagesError}
        />}

        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.inputButton}>
              <Ionicons name="add" size={24} color={Colors.gray[600]} />
            </TouchableOpacity>

            <View style={styles.inputWrapper}>
              <TextInput
                editable={chatActive}
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
              disabled={!message.trim() || sending || !chatActive}
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
