import { styles } from '../screen-styles/app/notifications/index';
import { Colors } from '@/constants/styles';
import type { Notification } from '@/types';
import { formatRelativeTime } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export const notificationTypeConfig: Record<
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
  driver_trip_revenue: {
    icon: 'wallet-outline',
    color: Colors.successDark,
    background: Colors.success + '18',
  },
  driver_booking_earning_confirmed: {
    icon: 'checkmark-circle-outline',
    color: Colors.successDark,
    background: Colors.success + '18',
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

export const notificationDataLabels: Record<string, string> = {
  type: 'Type',
  tripId: 'ID Trajet',
  bookingId: 'ID Réservation',
  conversationId: 'ID Conversation',
  userId: 'ID Utilisateur',
  message: 'Message',
  status: 'Statut',
};

export type NotificationListItemProps = {
  notification: Notification;
  onDelete: (notificationId: string) => void;
  onPress: (notification: Notification) => void;
};

export const NotificationListItem = React.memo(function NotificationListItem({
  notification,
  onDelete,
  onPress,
}: NotificationListItemProps) {
  const notificationType = notification.data?.type || 'default';
  const config = notificationTypeConfig[notificationType] ?? notificationTypeConfig.default;
  const isUnread = !notification.isRead;

  return (
    <TouchableOpacity
      style={[styles.notificationCard, isUnread && styles.notificationCardUnread]}
      onPress={() => onPress(notification)}
      activeOpacity={0.85}
    >
      <View style={[styles.notificationIcon, { backgroundColor: config.background }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text style={styles.notificationTitle} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.notificationTime} numberOfLines={1}>
            {formatRelativeTime(notification.createdAt)}
          </Text>
        </View>
        <Text style={styles.notificationMessage} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
      {isUnread && <View style={styles.unreadDot} />}
      <TouchableOpacity
        accessibilityLabel="Supprimer la notification"
        activeOpacity={0.8}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onDelete(notification.id);
        }}
        style={styles.inlineDeleteButton}
      >
        <Ionicons name="trash-outline" size={18} color={Colors.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});
