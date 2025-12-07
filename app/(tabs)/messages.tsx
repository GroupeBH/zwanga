import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useListConversationsQuery } from '@/store/api/messageApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectConversations, selectUser } from '@/store/selectors';
import { setConversations } from '@/store/slices/messagesSlice';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MessagesScreen() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const conversations = useAppSelector(selectConversations);
  const [search, setSearch] = useState('');
  const { data, isLoading, isFetching } = useListConversationsQuery({ page: 1, limit: 50 });
  const router = useRouter();

  useEffect(() => {
    if (data?.data) {
      dispatch(setConversations(data.data));
    }
  }, [data, dispatch]);

  const formatTimestamp = (rawValue: Date | string | number | null | undefined) => {
    if (!rawValue) {
      return '--';
    }

    let date: Date;

    if (rawValue instanceof Date) {
      date = rawValue;
    } else if (typeof rawValue === 'number') {
      date = new Date(rawValue);
    } else {
      const parsed = new Date(rawValue);
      if (Number.isNaN(parsed.getTime())) {
        return '--';
      }
      date = parsed;
    }

    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'À l\'instant';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}j`;
  };

  const filteredConversations = useMemo(() => {
    if (!search.trim()) {
      return conversations;
    }
    const normalized = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      const counterpart = conversation.participants.find((participant) => participant.userId !== user?.id);
      const counterpartName = counterpart?.user
        ? `${counterpart.user.firstName ?? ''} ${counterpart.user.lastName ?? ''}`.trim()
        : '';
      const title = conversation.title ?? counterpartName;
      const lastMessage = conversation.lastMessage?.content ?? '';
      return (
        title?.toLowerCase().includes(normalized) ||
        lastMessage.toLowerCase().includes(normalized) ||
        counterpartName.toLowerCase().includes(normalized)
      );
    });
  }, [conversations, search, user?.id]);

  const getConversationTitle = (conversation: typeof conversations[number]) => {
    if (conversation.title) {
      return conversation.title;
    }
    const counterpart = conversation.participants.find((participant) => participant.userId !== user?.id);
    if (counterpart?.user) {
      const fullName = `${counterpart.user.firstName ?? ''} ${counterpart.user.lastName ?? ''}`.trim();
      if (fullName) {
        return fullName;
      }
    }
    return 'Conversation';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Messages</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/invite')}
          >
            <Ionicons name="person-add" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Barre de recherche */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.gray[600]} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher une conversation"
            placeholderTextColor={Colors.gray[500]}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {(isLoading || isFetching) && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Mise à jour des messages…</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredConversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.gray[500]} />
            </View>
            <Text style={styles.emptyTitle}>Aucun message</Text>
            <Text style={styles.emptyText}>
              Vos conversations apparaîtront ici
            </Text>
          </View>
        ) : (
          filteredConversations.map((conversation, index) => {
            const subtitle = conversation.lastMessage?.content ?? 'Conversation démarrée';
            const timestamp = formatTimestamp(conversation.lastMessage?.createdAt ?? conversation.lastMessageAt);
            const title = getConversationTitle(conversation);
            return (
              <Animated.View
                key={conversation.id}
                entering={FadeInDown.delay(index * 50)}
              >
                <TouchableOpacity
                  style={styles.conversationItem}
                  onPress={() =>
                    router.push({
                      pathname: `/chat/${conversation.id}`,
                      params: {
                        title,
                      },
                    })
                  }
                >
                  <View style={styles.avatarContainer}>
                    <View style={styles.avatar} />
                    <View style={styles.onlineBadge} />
                  </View>

                  <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                      <Text style={styles.conversationName}>{title}</Text>
                      <Text style={styles.conversationTime}>{timestamp}</Text>
                    </View>
                    <View style={styles.conversationFooter}>
                      <Text
                        style={[
                          styles.conversationMessage,
                          (conversation.unreadCount ?? 0) > 0 && styles.conversationMessageUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {subtitle}
                      </Text>
                      {(conversation.unreadCount ?? 0) > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{conversation.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  loadingText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  avatarContainer: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  conversationName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    flex: 1,
    fontSize: FontSizes.base,
  },
  conversationTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationMessage: {
    flex: 1,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  conversationMessageUnread: {
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  unreadBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
});
