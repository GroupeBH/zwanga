import { Spacing } from '@/constants/styles';
import { HOME_DASHBOARD_COLORS } from '@/features/home/homeDashboardTheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { styles } from '@/features/home/HomeHeader.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';

type Props =
  Pick<ReturnType<typeof useHomeContext>, 'insets' | 'router'>
  & Pick<ReturnType<typeof useHomeSheet>, 'firstName' | 'unreadNotifications'>
  & Pick<ReturnType<typeof useHomeDriverActivity>, 'ongoingDriverTrip'>
  & Pick<ReturnType<typeof useHomeTripSelection>, 'ongoingBookedTrip'>;

export const HomeHeader = React.memo(function HomeHeader({
  insets, router, firstName, ongoingDriverTrip, ongoingBookedTrip, unreadNotifications,
}: Props) {
  // Always identify the signed-in user by their first initial, never a trip's driver photo.
  const profileInitial = firstName.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View style={[styles.topOverlay, { top: insets.top + Spacing.lg }]} pointerEvents="box-none">
      <View style={styles.mapHeader} pointerEvents="box-none">
        <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Ouvrir le profil"
          style={styles.profileButton} onPress={() => router.push('/profile')}>
          <Text style={styles.userAvatarText}>{profileInitial}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.8} style={styles.notificationButton} accessibilityRole="button"
          accessibilityLabel={`Notifications${unreadNotifications ? ', ' + unreadNotifications + ' non lues' : ''}`}
          onPress={() => router.push('/notifications')}>
          <Ionicons name="notifications-outline" size={24} color={HOME_DASHBOARD_COLORS.ink} />
          {unreadNotifications > 0 && <View style={styles.notificationBadge}>
            <Text style={styles.notificationBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
          </View>}
        </TouchableOpacity>
      </View>
      {ongoingDriverTrip || ongoingBookedTrip ? (
        <View style={styles.activeTripPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Trajet en cours</Text>
        </View>
      ) : null}
    </View>
  );
});
