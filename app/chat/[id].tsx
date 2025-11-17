import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message {
  id: string;
  text: string;
  isMe: boolean;
  timestamp: Date;
  read: boolean;
}

export default function ChatScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const scrollViewRef = useRef<ScrollView>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Bonjour! Je suis intéressé par votre trajet.',
      isMe: false,
      timestamp: new Date(Date.now() - 3600000),
      read: true,
    },
    {
      id: '2',
      text: 'Bonjour! Pas de problème, il reste des places.',
      isMe: true,
      timestamp: new Date(Date.now() - 3500000),
      read: true,
    },
    {
      id: '3',
      text: 'Rendez-vous au rond-point ?',
      isMe: false,
      timestamp: new Date(Date.now() - 600000),
      read: true,
    },
    {
      id: '4',
      text: 'Oui, à 14h comme prévu. À tout à l\'heure !',
      isMe: true,
      timestamp: new Date(Date.now() - 300000),
      read: true,
    },
  ]);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message.trim(),
      isMe: true,
      timestamp: new Date(),
      read: false,
    };

    setMessages([...messages, newMessage]);
    setMessage('');
  };

  const formatTime = (date: Date) => {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const formatDate = (date: Date) => {
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>

          <View style={styles.userInfo}>
            <View style={styles.avatar} />
            <View style={styles.userDetails}>
              <Text style={styles.userName}>Jean Mukendi</Text>
              <View style={styles.userStatus}>
                <View style={styles.onlineDot} />
                <Text style={styles.userStatusText}>En ligne</Text>
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
        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Date separator */}
          <View style={styles.dateSeparator}>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>{formatDate(new Date())}</Text>
            </View>
          </View>

          {messages.map((msg, index) => (
            <Animated.View
              key={msg.id}
              entering={FadeInDown.delay(index * 50)}
              style={[styles.messageWrapper, msg.isMe && styles.messageWrapperRight]}
            >
              <View
                style={[
                  styles.messageBubble,
                  msg.isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                ]}
              >
                <Text style={[styles.messageText, msg.isMe && styles.messageTextMe]}>
                  {msg.text}
                </Text>
                <View style={styles.messageFooter}>
                  <Text style={[styles.messageTime, msg.isMe && styles.messageTimeMe]}>
                    {formatTime(msg.timestamp)}
                  </Text>
                  {msg.isMe && (
                    <Ionicons
                      name={msg.read ? 'checkmark-done' : 'checkmark'}
                      size={14}
                      color={Colors.white}
                      style={styles.checkIcon}
                    />
                  )}
                </View>
              </View>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Input */}
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
              disabled={!message.trim()}
            >
              <Ionicons
                name="send"
                size={20}
                color={message.trim() ? Colors.white : Colors.gray[600]}
              />
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
