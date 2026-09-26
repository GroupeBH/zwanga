import { Colors, Spacing } from '@/constants/styles';
import { getInitials } from '@/features/home/homeModel';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Image,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { styles } from '@/features/home/HomeHeader.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDriverActivity } from '@/hooks/home/useHomeDriverActivity';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
import type { useHomeRequestHighlight } from '@/hooks/home/useHomeRequestHighlight';
import { HomeActivityCards } from './HomeActivityCards';
import type { useHomePriorityDismissals } from '@/hooks/home/useHomePriorityDismissals';
type Props =
  Pick<ReturnType<typeof useHomeContext>,
    'insets'
    | 'router'
  >
  & Pick<ReturnType<typeof useHomeSheet>,
    'avatarUri'
    | 'firstName'
    | 'unreadNotifications'
  >
  & Pick<ReturnType<typeof useHomeDriverActivity>,
    'ongoingDriverTrip'
  >
  & Pick<ReturnType<typeof useHomeTripSelection>,
    'ongoingBookedTrip'
    | 'featuredDriverReservation'
    | 'featuredDriverReservationStatus'
    | 'featuredDriverReservationPassengerName'
    | 'featuredDriverReservationSeatsLabel'
    | 'featuredDriverUpcomingTrip'
    | 'featuredDriverUpcomingTripSeatsLabel'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'activeTripRequest'
    | 'activeRequestStatus'
  >
  & Pick<ReturnType<typeof useHomeRequestHighlight>, 'highlightedDriverRequest' | 'highlightedRequestDistance'>
  & Pick<ReturnType<typeof useHomeMapNavigation>,
    'openTripRequestDetail'
  > & Pick<ReturnType<typeof useHomePriorityDismissals>, 'dismissPriority'>
  & { prioritiesEnabled: boolean };
export const HomeHeader = React.memo(function HomeHeader({
  insets,
  router,
  avatarUri,
  firstName,
  ongoingDriverTrip,
  ongoingBookedTrip,
  unreadNotifications,
  featuredDriverReservation,
  featuredDriverReservationStatus,
  featuredDriverReservationPassengerName,
  featuredDriverReservationSeatsLabel,
  featuredDriverUpcomingTrip,
  featuredDriverUpcomingTripSeatsLabel,
  activeTripRequest,
  activeRequestStatus,
  openTripRequestDetail,
  highlightedDriverRequest,
  highlightedRequestDistance,
  dismissPriority,
  prioritiesEnabled,
}: Props) {
  const activeTripLabel = ongoingDriverTrip
    ? 'Trajet conducteur en cours'
    : ongoingBookedTrip
      ? 'Trajet réservé en cours' : null;
  return (<View style={[styles.topOverlay, { top: insets.top + Spacing.sm }]}>
    <View style={styles.headerCard}>
      <TouchableOpacity
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le profil"
        style={styles.identityBlock}
        onPress={() => router.push('/profile')}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.userAvatar} resizeMode="cover" />
        ) : (
          <View style={[styles.userAvatar, styles.userAvatarFallback]}>
            <Text style={styles.userAvatarText}>{getInitials(firstName)}</Text>
          </View>
        )}
        <View style={styles.identityText}>
          <Text style={styles.greeting} numberOfLines={1}>
            Bonjour, {firstName}
          </Text>
          {activeTripLabel && <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText} numberOfLines={1}>
              {activeTripLabel}
            </Text>
          </View>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.75}
        style={styles.notificationButton}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir les notifications"
        onPress={() => router.push('/notifications')}
      >
        <Ionicons name="notifications-outline" size={23} color={Colors.primary} />
        {unreadNotifications > 0 && (
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationBadgeText}>
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>

    <View style={styles.actionDock}>
      <TouchableOpacity
        activeOpacity={0.88}
        style={[styles.actionButton, styles.actionPublishButton]}
        onPress={() => router.push('/publish')}
      >
        <Ionicons name="add-circle-outline" size={18} color={Colors.white} />
        <Text style={[styles.actionButtonText, styles.actionButtonTextStrong]} numberOfLines={1}>Publier</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.88}
        style={[styles.actionButton, styles.actionRequestButton]}
        onPress={() => router.push(getTripRequestCreateHref())}
      >
        <Ionicons name="paper-plane-outline" size={16} color={Colors.white} />
        <Text style={[styles.actionButtonText, styles.actionButtonTextStrong]} numberOfLines={1}>Demander</Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.actionSearchButton}
        onPress={() => router.push('/search')}
      >
        <Ionicons name="search" size={17} color={Colors.white} />
        <Text style={styles.actionSearchText} numberOfLines={1}>Chercher</Text>
      </TouchableOpacity>
    </View>

    <HomeActivityCards
      dismissPriority={dismissPriority}
      prioritiesEnabled={prioritiesEnabled}
      highlightedDriverRequest={highlightedDriverRequest}
      highlightedRequestDistance={highlightedRequestDistance}
      featuredDriverReservation={featuredDriverReservation}
      featuredDriverReservationStatus={featuredDriverReservationStatus}
      router={router}
      featuredDriverReservationPassengerName={featuredDriverReservationPassengerName}
      featuredDriverReservationSeatsLabel={featuredDriverReservationSeatsLabel}
      featuredDriverUpcomingTrip={featuredDriverUpcomingTrip}
      featuredDriverUpcomingTripSeatsLabel={featuredDriverUpcomingTripSeatsLabel}
      activeTripRequest={activeTripRequest}
      activeRequestStatus={activeRequestStatus}
      openTripRequestDetail={openTripRequestDetail}
    />




  </View>);
});
