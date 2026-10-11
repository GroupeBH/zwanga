import { notificationDataLabels, NotificationListItem } from '../features/notifications/NotificationListItem';
import { styles } from '../features/screen-styles/app/notifications/index';
import { useDialog } from '@/components/ui/DialogProvider';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { Colors } from '@/constants/styles';
import {
  useDisableNotificationsMutation,
  useGetNotificationPagesInfiniteQuery,
  useMarkAllNotificationsAsReadMutation,
  useMarkNotificationsAsReadMutation,
} from '@/store/api/notificationApi';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { canShowRequestNotification } from '@/features/notifications/requestVisibility';
import type { Notification } from '@/types';
import { formatDateTime } from '@/utils/dateHelpers';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getNotificationHref, handleNotificationNavigation } from '@/utils/notificationNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Modal,
  Platform,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HistoryPaginationFooter } from '@/components/ui/HistoryPaginationFooter';

const EMPTY_NOTIFICATIONS: Notification[] = [];

export default function NotificationsScreen() {
  const isScreenActive = useScreenIsActive();
  const router = useRouter();
  const { showDialog } = useDialog();
  const { data: currentUser } = useGetCurrentUserQuery();
  const {
    data: notificationsData,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isFetchingPreviousPage,
    hasPreviousPage,
    fetchPreviousPage,
    isError,
    hasNextPage: hasMoreNotifications,
    fetchNextPage,
    refetch,
  } = useGetNotificationPagesInfiniteQuery(undefined, {
    skip: !isScreenActive,
    refetchOnMountOrArgChange: 30,
    refetchOnReconnect: true,
  });

  const [markNotificationsAsRead] = useMarkNotificationsAsReadMutation();
  const [markAllAsRead] = useMarkAllNotificationsAsReadMutation();
  const [disableNotifications] = useDisableNotificationsMutation();
  const [selected, setSelectedNotification] = useState<Notification | null>(null);
  const selectedNotification = selected && canShowRequestNotification(selected.data, currentUser) ? selected : null;

  const notifications = useMemo(() => notificationsData
    ? Array.from(new Map(notificationsData.pages.flatMap((page) => page.notifications)
      .filter(item => canShowRequestNotification(item.data, currentUser)).map((item) => [item.id, item])).values())
    : EMPTY_NOTIFICATIONS, [notificationsData, currentUser]);
  const unreadCount = notificationsData?.pages[0]?.unreadCount ?? 0;

  const handleSelectNotification = useCallback(async (notification: Notification) => {
    if (!canShowRequestNotification(notification.data, currentUser)) return;
    const data = notification.data || {};
    if (getNotificationHref(data, currentUser)) {
      handleNotificationNavigation(data, router, currentUser);
    } else {
      setSelectedNotification(notification);
    }

    // Navigation must not wait for the network. Keep acknowledgements in RTK Query.
    try {
      if (!notification.isRead) {
        await markNotificationsAsRead({ notificationIds: [notification.id] }).unwrap();
      }
      await disableNotifications({ notificationIds: [notification.id] }).unwrap();
    } catch (error) {
      console.warn('Impossible de marquer la notification comme lue ou de la désactiver:', error);
    }
  }, [currentUser, disableNotifications, markNotificationsAsRead, router]);

  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead().unwrap();
    } catch (error) {
      console.warn('Impossible de marquer toutes les notifications comme lues:', error);
    }
  }, [markAllAsRead]);

  const handleDeleteNotification = useCallback(async (notificationId: string) => {
    try {
      await disableNotifications({ notificationIds: [notificationId] }).unwrap();
    } catch (error: any) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de supprimer la notification.'),
      });
    }
  }, [disableNotifications, showDialog]);

  const handleDeleteAllNotifications = useCallback(() => {
    if (notifications.length === 0) {
      return;
    }

    const isPartialHistory = hasMoreNotifications || hasPreviousPage;
    const deleteTitle = isPartialHistory
      ? 'Supprimer les notifications affichées'
      : 'Supprimer toutes les notifications';
    const deleteLabel = isPartialHistory ? 'Supprimer affichées' : 'Supprimer tout';
    const deleteMessage = isPartialHistory
      ? `Supprimer les ${notifications.length} notifications affichées ? Les autres pages resteront accessibles.`
      : `Êtes-vous sûr de vouloir supprimer toutes les ${notifications.length} notification${notifications.length > 1 ? 's' : ''} ? Cette action est irréversible.`;

    showDialog({
      variant: 'warning',
      title: deleteTitle,
      message: deleteMessage,
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: deleteLabel,
          variant: 'primary',
          onPress: async () => {
            try {
              const allNotificationIds = notifications.map((n) => n.id);
              await disableNotifications({ notificationIds: allNotificationIds }).unwrap();
              showDialog({
                variant: 'success',
                title: 'Notifications supprimées',
                message: isPartialHistory
                  ? 'Les notifications affichées ont été supprimées avec succès.'
                  : 'Toutes les notifications ont été supprimées avec succès.',
              });
            } catch (error: any) {
              showDialog({
                variant: 'danger',
                title: 'Erreur',
                message: getApiErrorMessage(error, 'Impossible de supprimer les notifications.'),
              });
            }
          },
        },
      ],
    });
  }, [disableNotifications, hasMoreNotifications, hasPreviousPage, notifications, showDialog]);

  const renderNotificationData = (data: Record<string, any>) => {
    const dataEntries = Object.entries(data);
    
    // Mapper les clés communes à des labels lisibles
    return (
      <View style={styles.dataList}>
        {dataEntries.map(([key, value]) => {
          const label = notificationDataLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);
          const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
          
          return (
            <View key={key} style={styles.dataRow}>
              <Text style={styles.dataLabel}>{label}:</Text>
              <Text style={styles.dataValue} numberOfLines={3}>
                {displayValue}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const handleRefresh = useCallback(() => {
    if (isScreenActive && !isFetching) void refetch();
  }, [isScreenActive, isFetching, refetch]);

  const handleLoadMore = useCallback(() => {
    if (!isScreenActive || isFetching || !hasMoreNotifications) {
      return;
    }

    void (isError ? refetch() : fetchNextPage());
  }, [fetchNextPage, hasMoreNotifications, isFetching, isScreenActive, isError, refetch]);

  const keyExtractor = useCallback((notification: Notification) => notification.id, []);

  const renderNotificationItem = useCallback<ListRenderItem<Notification>>(
    ({ item }) => (
      <NotificationListItem
        notification={item}
        onDelete={handleDeleteNotification}
        onPress={handleSelectNotification}
      />
    ),
    [handleDeleteNotification, handleSelectNotification],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <Ionicons name="notifications-off-outline" size={40} color={Colors.gray[500]} />
        </View>
        <Text style={styles.emptyTitle}>{isError ? 'Chargement interrompu' : 'Aucune notification'}</Text>
        <Text style={styles.emptyDescription}>
          {isError ? 'Appuyez sur actualiser pour réessayer.' : 'Nous vous préviendrons dès qu’il y aura quelque chose de nouveau.'}
        </Text>
      </View>
    ),
    [isError],
  );

  const renderListFooter = useCallback(() => {
    return <HistoryPaginationFooter hasMore={hasMoreNotifications} loading={isFetchingNextPage}
      disabled={isFetching || !isScreenActive} error={isError} loaded={notifications.length}
      label="Notifications plus anciennes" onLoad={handleLoadMore} />;
  }, [hasMoreNotifications, isFetchingNextPage, isFetching, isScreenActive, isError, notifications.length, handleLoadMore]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSubtitle}>{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllButton} onPress={handleMarkAllAsRead}>
              <Ionicons name="checkmark-done" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.deleteAllButton} onPress={handleDeleteAllNotifications}>
              <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            {isFetching ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="refresh" size={20} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loaderText}>Chargement des notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={keyExtractor}
          renderItem={renderNotificationItem}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            notifications.length === 0 && styles.listContentEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isFetchingNextPage && !isFetchingPreviousPage}
              onRefresh={handleRefresh}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={renderEmptyState}
          ListHeaderComponent={<HistoryPaginationFooter hasMore={hasPreviousPage} loading={isFetchingPreviousPage}
            disabled={isFetching || !isScreenActive} error={isError} loaded={notifications.length}
            showCount={false} label="Notifications plus récentes"
            onLoad={() => { if (isScreenActive && hasPreviousPage && !isFetching) void (isError ? refetch() : fetchPreviousPage()); }} />}
          ListFooterComponent={renderListFooter}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={60}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={() => { if (!hasPreviousPage && !isError) handleLoadMore(); }}
          onEndReachedThreshold={0.35}
        />
      )}

      <Modal animationType="fade" transparent visible={selectedNotification !== null}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedNotification?.title}</Text>
              <TouchableOpacity onPress={() => setSelectedNotification(null)}>
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTime}>
              Reçu {selectedNotification ? formatDateTime(selectedNotification.createdAt) : ''}
            </Text>
            <Text style={styles.modalMessage}>{selectedNotification?.body}</Text>
            {selectedNotification?.data && renderNotificationData(selectedNotification.data)}
            <View style={styles.modalActions}>
              {(() => {
                const data = selectedNotification?.data || {};
                const canNavigate = Boolean(getNotificationHref(data, currentUser));

                if (canNavigate) {
                  return (
                    <>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.modalSecondaryButton]}
                        onPress={() => {
                          setSelectedNotification(null);
                          handleNotificationNavigation(data, router, currentUser);
                        }}
                      >
                        <Text style={styles.modalSecondaryText}>Voir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.modalPrimaryButton]}
                        onPress={() => setSelectedNotification(null)}
                      >
                        <Text style={styles.modalPrimaryText}>Fermer</Text>
                      </TouchableOpacity>
                    </>
                  );
                }
                return (
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalPrimaryButton]}
                    onPress={() => setSelectedNotification(null)}
                  >
                    <Text style={styles.modalPrimaryText}>Fermer</Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}


