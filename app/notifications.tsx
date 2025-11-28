import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';
import { useGetNotificationsQuery, useMarkNotificationAsReadMutation } from '@/store/api/notificationApi';
import { formatDateTime, formatRelativeTime } from '@/utils/dateHelpers';

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type?: string;
  createdAt: string;
  read?: boolean;
  readAt?: string | null;
};

const notificationTypeConfig: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; background: string }
> = {
  booking: {
    icon: 'car-outline',
    color: Colors.primary,
    background: Colors.primary + '18',
  },
  message: {
    icon: 'chatbubble-ellipses-outline',
    color: Colors.info,
    background: Colors.info + '18',
  },
  warning: {
    icon: 'warning-outline',
    color: Colors.danger,
    background: Colors.danger + '18',
  },
  default: {
    icon: 'notifications-outline',
    color: Colors.gray[700],
    background: Colors.gray[200],
  },
};

export default function NotificationsScreen() {
  const router = useRouter();
  const {
    data: notifications,
    isLoading,
    isFetching,
    refetch,
  } = useGetNotificationsQuery();
  const [markNotificationAsRead] = useMarkNotificationAsReadMutation();
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

  const unreadCount = useMemo(
    () =>
      (notifications ?? []).filter((notification) => !notification.read && !notification.readAt).length,
    [notifications],
  );

  const handleSelectNotification = async (notification: NotificationItem) => {
    setSelectedNotification(notification);
    if (!notification.read && !notification.readAt) {
      try {
        await markNotificationAsRead(notification.id).unwrap();
      } catch (error) {
        console.warn('Impossible de marquer la notification comme lue:', error);
      }
    }
  };

  const renderNotificationCard = (notification: NotificationItem) => {
    const config = notificationTypeConfig[notification.type ?? 'default'] ?? notificationTypeConfig.default;
    const isUnread = !notification.read && !notification.readAt;

    return (
      <TouchableOpacity
        key={notification.id}
        style={[styles.notificationCard, isUnread && styles.notificationCardUnread]}
        onPress={() => handleSelectNotification(notification)}
        activeOpacity={0.85}
      >
        <View style={[styles.notificationIcon, { backgroundColor: config.background }]}>
          <Ionicons name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.notificationContent}>
          <View style={styles.notificationHeader}>
            <Text style={styles.notificationTitle}>{notification.title ?? 'Notification'}</Text>
            <Text style={styles.notificationTime}>{formatRelativeTime(notification.createdAt)}</Text>
          </View>
          <Text style={styles.notificationMessage} numberOfLines={2}>
            {notification.message}
          </Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

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
        <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()}>
          {isFetching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loaderText}>Chargement des notifications...</Text>
          </View>
        ) : notifications && notifications.length > 0 ? (
          notifications.map((notification) => renderNotificationCard(notification))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={40} color={Colors.gray[500]} />
            </View>
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyDescription}>
              Nous vous préviendrons dès qu’il y aura quelque chose de nouveau.
            </Text>
          </View>
        )}
      </ScrollView>

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
            <Text style={styles.modalMessage}>{selectedNotification?.message}</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimaryButton]}
                onPress={() => setSelectedNotification(null)}
              >
                <Text style={styles.modalPrimaryText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  notificationCardUnread: {
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  notificationTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    flex: 1,
    marginRight: Spacing.sm,
  },
  notificationTime: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  notificationMessage: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    marginLeft: Spacing.sm,
  },
  loaderContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loaderText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.xs,
  },
  emptyDescription: {
    color: Colors.gray[600],
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flex: 1,
    marginRight: Spacing.sm,
  },
  modalTime: {
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  modalMessage: {
    color: Colors.gray[700],
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  modalPrimaryButton: {
    backgroundColor: Colors.primary,
  },
  modalPrimaryText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
});

