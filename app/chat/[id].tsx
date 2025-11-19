import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { chatSocket } from '@/services/chatSocket';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useGetConversationQuery, useGetConversationMessagesQuery, useMarkConversationAsReadMutation, useSendConversationMessageMutation, messageApi } from '@/store/api/messageApi';
import { addMessage as addMessageAction, markConversationMessagesRead, setMessages, upsertConversation } from '@/store/slices/messagesSlice';
import { selectUser } from '@/store/selectors';
import { Message } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { id, title: initialTitle } = useLocalSearchParams<{ id?: string; title?: string }>();
  const conversationId = typeof id === 'string' ? id : '';
  const scrollViewRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState('');
  const user = useAppSelector(selectUser);

  const { data: conversation, isLoading: conversationLoading } = useGetConversationQuery(conversationId, {
    skip: !conversationId,
  });
  const { data: messagesData, isLoading: messagesLoading } = useGetConversationMessagesQuery(
    { conversationId },
    { skip: !conversationId },
  );
  const [sendMessageMutation, { isLoading: sending }] = useSendConversationMessageMutation();
  const [markConversationAsRead] = useMarkConversationAsReadMutation();

  const messages = messagesData ?? [];

  useEffect(() => {
    if (conversation) {
      dispatch(upsertConversation(conversation));
    }
  }, [conversation, dispatch]);

  useEffect(() => {
    if (conversationId && messagesData) {
      dispatch(setMessages({ conversationId, messages: messagesData }));
      dispatch(markConversationMessagesRead(conversationId));
    }
  }, [conversationId, dispatch, messagesData]);

  useEffect(() => {
    if (conversationId) {
      markConversationAsRead(conversationId);
    }
  }, [conversationId, markConversationAsRead]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let joined = false;

    const setupSocket = async () => {
      if (conversation?.bookingId) {
        await chatSocket.joinBookingRoom(conversation.bookingId);
        joined = true;
      }

      unsubscribe = chatSocket.subscribeToMessages((incoming) => {
        if (incoming.conversationId === conversationId) {
          dispatch(
            messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
              draft.push(incoming);
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

    setupSocket();

    return () => {
      if (unsubscribe) unsubscribe();
      if (joined && conversation?.bookingId) {
        chatSocket.leaveBookingRoom(conversation.bookingId);
      }
    };
  }, [conversation?.bookingId, conversationId, dispatch, user?.id]);

  const handleSend = async () => {
    if (!message.trim() || !conversationId) {
      return;
    }

    const content = message.trim();
    setMessage('');

    try {
      const saved = await sendMessageMutation({ conversationId, content }).unwrap();
      dispatch(
        messageApi.util.updateQueryData('getConversationMessages', { conversationId }, (draft) => {
          draft.push(saved);
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
    return conversation?.participants.find((participant) => participant.userId !== user?.id)?.user;
  }, [conversation?.participants, user?.id]);

  const headerTitle =
    conversation?.title ||
    (counterpart ? `${counterpart.firstName ?? ''} ${counterpart.lastName ?? ''}`.trim() : initialTitle) ||
    'Conversation';

  const groupedMessages = useMemo(() => {
    return messages.reduce<Record<string, Message[]>>((acc, msg) => {
      const label = formatDate(msg.createdAt);
      if (!acc[label]) {
        acc[label] = [];
      }
      acc[label].push(msg);
      return acc;
    }, {});
  }, [messages]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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

          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="call" size={20} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="ellipsis-vertical" size={20} color={Colors.gray[600]} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {messagesLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          )}

          {Object.entries(groupedMessages).map(([label, bucket]) => (
            <View style={styles.dateSeparator} key={label}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateText}>{label}</Text>
              </View>
              {bucket.map((msg, index) => {
                const isMe = msg.senderId === user?.id;
                return (
                  <Animated.View
                    key={msg.id}
                    entering={FadeInDown.delay(index * 50)}
                    style={[styles.messageWrapper, isMe && styles.messageWrapperRight]}
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
                  </Animated.View>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={styles.inputContainer}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: Spacing.md,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  userStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  userStatusText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  headerButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSeparator: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dateBadge: {
    backgroundColor: Colors.gray[200],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  dateText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  messageWrapper: {
    marginBottom: Spacing.md,
    alignItems: 'flex-start',
  },
  messageWrapperRight: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
  },
  messageBubbleMe: {
    backgroundColor: Colors.primary,
    borderTopRightRadius: BorderRadius.sm,
  },
  messageBubbleOther: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.sm,
    ...CommonStyles.shadowSm,
  },
  messageText: {
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  messageTextMe: {
    color: Colors.white,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.xs,
  },
  messageTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  messageTimeMe: {
    color: Colors.white,
    opacity: 0.7,
  },
  checkIcon: {
    marginLeft: Spacing.xs,
    opacity: 0.7,
  },
  inputContainer: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  emojiButton: {
    marginLeft: Spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  sendButtonActive: {
    backgroundColor: Colors.primary,
  },
});
