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
import { HomeDriverStatus } from './HomeDriverStatus';

type Props =
  Pick<ReturnType<typeof useHomeContext>, 'insets' | 'router'>
  & Pick<ReturnType<typeof useHomeSheet>, 'profileInitial' | 'unreadNotifications'>
  & Pick<ReturnType<typeof useHomeDriverActivity>, 'ongoingDriverTrip'>
  & Pick<ReturnType<typeof useHomeTripSelection>, 'ongoingBookedTrip'>
  & { ongoingBookingId?: string | null; isDriver?: boolean; isScreenActive?: boolean };

export const HomeHeader = React.memo(function HomeHeader({
  insets, router, profileInitial, ongoingDriverTrip, ongoingBookedTrip, unreadNotifications,
  ongoingBookingId, isDriver = false, isScreenActive = true,
}: Props) {
  const ongoing = Boolean(ongoingDriverTrip || ongoingBookedTrip);
  // Same destinations as the global ongoing-trip banner.
  const ongoingRoute = ongoingDriverTrip?.id ? `/trip/navigate/${ongoingDriverTrip.id}` as const
    : ongoingBookedTrip && ongoingBookingId ? `/booking/navigate/${ongoingBookingId}` as const : null;
  const notifications = (
    <TouchableOpacity activeOpacity={0.8} style={styles.notificationButton} accessibilityRole="button"
      accessibilityLabel={`Notifications${unreadNotifications ? ', ' + unreadNotifications + ' non lues' : ''}`}
      onPress={() => router.push('/notifications')}>
      <Ionicons name="notifications-outline" size={24} color={HOME_DASHBOARD_COLORS.ink} />
      {unreadNotifications > 0 && <View style={styles.notificationBadge}>
        <Text style={styles.notificationBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
      </View>}
    </TouchableOpacity>
  );
  const profile = (
    <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Ouvrir le profil"
      style={styles.profileButton} onPress={() => router.push('/profile')}>
      <Text style={styles.userAvatarText}>{profileInitial}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[styles.topOverlay, { top: insets.top + Spacing.lg }]} pointerEvents="box-none">
      {isDriver && !ongoing ? (
        <View style={styles.mapHeader} pointerEvents="box-none">
          <View style={styles.driverStatusSlot} pointerEvents="box-none">
            <HomeDriverStatus active={isScreenActive} onPress={() => router.push('/driver-availability')} />
          </View>
          <View style={styles.headerActions} pointerEvents="box-none">{notifications}{profile}</View>
        </View>
      ) : (
        <View style={styles.mapHeader} pointerEvents="box-none">{notifications}{profile}</View>
      )}
      {ongoing ? (ongoingRoute ? (
        <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" style={styles.activeTripPill}
          accessibilityLabel="Trajet en cours" accessibilityHint="Ouvrir le guidage du trajet en cours."
          onPress={() => router.push(ongoingRoute)}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Trajet en cours</Text>
          <Ionicons name="chevron-forward" size={14} color={HOME_DASHBOARD_COLORS.muted} accessible={false} />
        </TouchableOpacity>
      ) : (
        <View style={styles.activeTripPill}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Trajet en cours</Text>
        </View>
      )) : null}
    </View>
  );
});
