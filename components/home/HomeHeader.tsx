import { Spacing } from '@/constants/styles';
import { HOME_DASHBOARD_COLORS } from '@/features/home/homeDashboardTheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { styles } from '@/features/home/HomeHeader.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
import { HomeDriverStatus } from './HomeDriverStatus';
import { inboxAttentionCount } from '@/features/notifications/inboxSections';

type Props =
  Pick<ReturnType<typeof useHomeContext>, 'insets' | 'router'>
  & Pick<ReturnType<typeof useHomeSheet>, 'profileInitial' | 'unreadNotifications'>
  & Pick<ReturnType<typeof useHomeDriverActivity>, 'ongoingDriverTrip'>
  & Pick<ReturnType<typeof useHomeTripSelection>, 'ongoingBookedTrip'>
  & { unreadMessages?: number; ongoingBookingId?: string | null; isDriver?: boolean; isScreenActive?: boolean; showOngoingShortcut?: boolean; discoveryLabel?: string; onDiscover?: () => void; hasRequestPickup?: boolean };

export const HomeHeader = React.memo(function HomeHeader({
  insets, router, profileInitial, ongoingDriverTrip, ongoingBookedTrip, unreadNotifications,
  ongoingBookingId, isDriver = false, isScreenActive = true, showOngoingShortcut = true,
  discoveryLabel, onDiscover, unreadMessages = 0, hasRequestPickup = false,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const ongoing = Boolean(ongoingDriverTrip || ongoingBookedTrip);
  const inboxCount = inboxAttentionCount(unreadNotifications, unreadMessages);
  // Same destinations as the global ongoing-trip banner.
  const ongoingRoute = ongoingDriverTrip?.id ? `/trip/navigate/${ongoingDriverTrip.id}` as const
    : ongoingBookedTrip && ongoingBookingId ? `/booking/navigate/${ongoingBookingId}` as const : null;
  const notifications = (
    <TouchableOpacity activeOpacity={0.8} style={styles.notificationButton} accessibilityRole="button"
      accessibilityLabel={`Notifications et messages, ${unreadNotifications} notifications non lues, ${unreadMessages} messages non lus`}
      onPress={() => router.push('/notifications')}>
      <Ionicons name="notifications-outline" size={24} color={HOME_DASHBOARD_COLORS.ink} />
      {inboxCount > 0 && <View style={styles.notificationBadge}>
        <Text maxFontSizeMultiplier={1} style={styles.notificationBadgeText}>{inboxCount > 9 ? '9+' : inboxCount}</Text>
      </View>}
    </TouchableOpacity>
  );
  const profile = (
    <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Ouvrir le profil"
      style={styles.profileButton} onPress={() => router.push('/profile')}>
      <Text maxFontSizeMultiplier={1} style={styles.userAvatarText}>{profileInitial}</Text>
    </TouchableOpacity>
  );
  return (
    <View style={[styles.topOverlay, { top: insets.top + Spacing.lg }]} pointerEvents="box-none">
      {isDriver && !ongoing && !hasRequestPickup ? (
        <View style={[styles.mapHeader, fontScale > 1.3 && styles.largeMapHeader]} pointerEvents="box-none">
          <View style={[styles.driverStatusSlot, fontScale > 1.3 && styles.largeDriverStatusSlot]} pointerEvents="box-none">
            <HomeDriverStatus active={isScreenActive} onPress={() => router.push('/driver-availability')} />
          </View>
          <View style={styles.headerActions} pointerEvents="box-none">{notifications}{profile}</View>
        </View>
      ) : (
        <View style={[styles.mapHeader, fontScale > 1.3 && styles.largeMapHeader]} pointerEvents="box-none">
          {!ongoing && !hasRequestPickup && <TouchableOpacity style={styles.passengerPosition} accessibilityRole="button" accessibilityLabel="Voir les départs près de vous" onPress={onDiscover}>
            <View style={[styles.driverStatusDot, styles.driverStatusWarn]} />
            <View style={styles.driverStatusCopy}><Text style={styles.driverStatusDetail}>Autour de vous</Text><Text style={styles.driverStatusTitle}>{discoveryLabel || 'Explorer les départs'}</Text></View>
          </TouchableOpacity>}
          <View style={styles.headerActions}>{notifications}{profile}</View>
        </View>
      )}
      {ongoing && showOngoingShortcut ? (ongoingRoute ? (
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
