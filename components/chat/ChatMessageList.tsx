import { Colors } from '@/constants/styles';
import { styles } from '@/features/screen-styles/app/chat/detail';
import type { Message } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, Text, TouchableOpacity, View } from 'react-native';

type Row = { kind: 'date'; id: string; label: string } | { kind: 'message'; id: string; message: Message };
type Props = {
  messages: Message[]; userId?: string; loading: boolean; refreshing: boolean;
  onRefresh: () => void; onMessageActions: (message: Message) => void;
  newestFirst?: boolean; hasOlder?: boolean; loadingOlder?: boolean; olderError?: boolean;
  onLoadOlder?: () => void; error?: boolean;
};
const visibleContentPosition = { minIndexForVisible: 0, autoscrollToTopThreshold: 80 };
const keyExtractor = (item: Row) => item.id;
const formatTime = (value: string) => {
  const date = new Date(value);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};
const formatDate = (value: string) => {
  const date = new Date(value), today = new Date(), yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/** Typing a draft must not re-render the native message list or rebuild its rows. */
export const ChatMessageList = memo(function ChatMessageList({
  messages, userId, loading, refreshing, onRefresh, onMessageActions,
  newestFirst, hasOlder, loadingOlder, olderError, onLoadOlder, error,
}: Props) {
  const rows = useMemo(() => {
    const result: Row[] = [];
    let previousDay = '';
    const ordered = newestFirst ? [...messages].reverse()
      : [...new Map(messages.map(item => [item.id, item])).values()]
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    for (const message of ordered) {
      const day = new Date(message.createdAt).toDateString();
      if (day !== previousDay) {
        result.push({ kind: 'date', id: `date:${day}`, label: formatDate(message.createdAt) });
        previousDay = day;
      }
      result.push({ kind: 'message', id: message.id, message });
    }
    return result.reverse();
  }, [messages, newestFirst]);
  const renderItem = useCallback(({ item }: { item: Row }) => {
    if (item.kind === 'date') {
      return <View style={styles.dateSeparator}><View style={styles.dateBadge}><Text style={styles.dateText}>{item.label}</Text></View></View>;
    }
    const msg = item.message, isMe = msg.senderId === userId;
    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}>
        <TouchableOpacity activeOpacity={0.8} onLongPress={() => { if (isMe) onMessageActions(msg); }}>
          <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
            <Text style={[styles.messageText, isMe && styles.messageTextMe]}>{msg.content}</Text>
            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, isMe && styles.messageTimeMe]}>{formatTime(msg.createdAt)}</Text>
              {isMe && <Ionicons name={msg.isRead ? 'checkmark-done' : 'checkmark'} size={14} color={Colors.white} style={styles.checkIcon} />}
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [userId, onMessageActions]);
  return (
    <FlatList
      inverted data={rows} keyExtractor={keyExtractor} renderItem={renderItem}
      initialNumToRender={20} maxToRenderPerBatch={12} windowSize={7}
      maintainVisibleContentPosition={visibleContentPosition}
      removeClippedSubviews={Platform.OS === 'android'}
      style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      ListFooterComponent={hasOlder ? <TouchableOpacity onPress={onLoadOlder} disabled={loadingOlder}
        accessibilityRole="button" style={{ padding: 16, alignItems: 'center' }}>
        {loadingOlder ? <ActivityIndicator color={Colors.primary} />
          : <Text style={{ color: Colors.primary }}>{olderError ? 'Réessayer de charger les anciens messages' : 'Voir les messages précédents'}</Text>}
      </TouchableOpacity> : null}
      ListEmptyComponent={loading ? <ActivityIndicator color={Colors.primary} /> : error
        ? <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={{ padding: 16 }}>
          <Text style={{ color: Colors.gray[700] }}>Impossible de charger les messages. Appuyez pour réessayer.</Text>
        </TouchableOpacity> : null}
    />
  );
});
