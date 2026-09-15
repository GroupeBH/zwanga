import { styles } from '../../features/screen-styles/app/tabs/messages/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Colors } from '@/constants/styles';
import { useDeleteConversationMutation, useListConversationPagesInfiniteQuery } from '@/store/api/messageApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectConversations, selectUser } from '@/store/selectors';
import { setConversations } from '@/store/slices/messagesSlice';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MessagesScreen() {
  const isScreenActive = useScreenIsActive();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const conversations = useAppSelector(selectConversations);
  const [search, setSearch] = useState('');
  const { data, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useListConversationPagesInfiniteQuery(undefined, {
    skip: !isScreenActive,
    refetchOnMountOrArgChange: 30,
    refetchOnReconnect: true,
  });
  const router = useRouter();
  const [deleteConversation] = useDeleteConversationMutation();
  const { showDialog } = useDialog();

  useEffect(() => {
    if (data) {
      dispatch(setConversations(Array.from(new Map(data.pages.flatMap((page) => page.data).map((item) => [item.id, item])).values())));
    }
  }, [data, dispatch]);

  const formatTimestamp = useCallback((rawValue: Date | string | number | null | undefined) => {
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
  }, []);

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

  const getConversationTitle = useCallback((conversation: typeof conversations[number]) => {
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
  }, [user?.id]);

  const handleDeleteConversation = useCallback((conversationId: string) => {
    if (!conversationId) return;

    showDialog({
      title: 'Supprimer la conversation',
      message:
        'Voulez-vous vraiment supprimer cette conversation ? Elle disparaîtra de votre liste. Les messages pourront être définitivement supprimés si plus aucun participant ne la conserve.',
      variant: 'danger',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'destructive',
          onPress: async () => {
            try {
              await deleteConversation({ conversationId }).unwrap();
            } catch (error) {
              console.warn('[Messages] Failed to delete conversation', error);
            }
          },
        },
      ],
    });
  }, [deleteConversation, showDialog]);

  const renderConversation = useCallback(
    ({ item: conversation }: { item: typeof conversations[number] }) => {
      const subtitle = conversation.lastMessage?.content ?? 'Conversation démarrée';
      const timestamp = formatTimestamp(
        conversation.lastMessage?.createdAt ?? conversation.lastMessageAt,
      );
      const title = getConversationTitle(conversation);

      return (
        <View style={styles.conversationRow}>
          <TouchableOpacity
            style={styles.conversationItem}
            onPress={() =>
              router.push({
                pathname: '/chat/[id]',
                params: { id: conversation.id, title },
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

          <TouchableOpacity
            style={styles.deleteConversationButton}
            onPress={() => handleDeleteConversation(conversation.id)}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      );
    },
    [formatTimestamp, getConversationTitle, handleDeleteConversation, router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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

      <FlatList
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={filteredConversations}
        renderItem={renderConversation}
        keyExtractor={(conversation) => conversation.id}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        refreshing={isFetching && !isFetchingNextPage}
        onRefresh={refetch}
        onEndReached={() => { if (hasNextPage && !isFetching) void fetchNextPage(); }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.primary} /> : null}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="chatbubbles-outline" size={48} color={Colors.gray[500]} />
            </View>
            <Text style={styles.emptyTitle}>Aucun message</Text>
            <Text style={styles.emptyText}>Vos conversations apparaîtront ici</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}


