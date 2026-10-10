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
    | 'isDriver'
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
  isDriver,
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
      <Text style={styles.actionHeading} accessibilityRole="header">Que voulez-vous faire ?</Text>
      <View style={styles.primaryActions}>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.actionButton, styles.actionSearchButton]}
          accessibilityRole="button"
          accessibilityLabel={isDriver ? 'Je cherche un client' : 'Je cherche un trajet'}
          accessibilityHint={isDriver ? 'Voir les commandes des passagers à prendre en charge.' : 'Voir les trajets publiés et réserver une place.'}
          onPress={() => { if (isDriver) router.push('/requests'); else router.push('/search'); }}
        >
          <Ionicons name="search" size={20} color={Colors.white} accessible={false} />
          <Text style={[styles.actionButtonText, styles.actionSearchText]}>{isDriver ? 'Je cherche un client' : 'Je cherche un trajet'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.88}
          style={[styles.actionButton, styles.actionPublishButton]}
          accessibilityRole="button"
          accessibilityLabel="Je propose un trajet"
          accessibilityHint="Publier votre trajet pour prendre des passagers."
          onPress={() => router.push('/publish')}
        >
          <Ionicons name="car-outline" size={20} color={Colors.primaryDark} accessible={false} />
          <Text style={styles.actionButtonText}>Je propose un trajet</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.actionRequestButton}
        accessibilityRole="button"
        accessibilityLabel="Je commande un trajet"
        accessibilityHint="Indiquer votre départ et votre destination pour trouver un conducteur."
        onPress={() => router.push(getTripRequestCreateHref())}
      >
        <Ionicons name="paper-plane-outline" size={18} color={Colors.primaryDark} accessible={false} />
        <Text style={styles.actionRequestText}>Je commande un trajet</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.primaryDark} accessible={false} />
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
