import { RECENT_TRIPS_LIMIT } from '@/features/home/homeModel';
import { homePriorityKeys } from '@/features/home/homePriorityDismissal';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { HOME_DASHBOARD_COLORS, styles } from '@/features/home/HomeTripsSheet.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomePriorityDismissals } from '@/hooks/home/useHomePriorityDismissals';
import type { useHomeRequestHighlight } from '@/hooks/home/useHomeRequestHighlight';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
import { HomeSheetLoadingState } from './HomeSheetLoadingState';
import { HomeSuggestionCard } from './HomeSuggestionCard';
import { HomeDriverEarnings } from './HomeDriverEarnings';
import { HomeDestinationShortcuts } from './HomeDestinationShortcuts';
import { SwipeableHomePriority } from './SwipeableHomePriority';
import { HomeEntryStatus } from './HomeEntryStatus';

type Props =
  Pick<ReturnType<typeof useHomeSheet>,
    'sheetBottomOffset' | 'sheetHeight' | 'onSheetLayout'
    | 'effectiveTripsSheetOpen' | 'toggleTripsSheet' | 'sheetTitle' | 'openSheetIndex'
    | 'sheetLoading' | 'sheetError'
    | 'refetchSheetContent' | 'sheetEmpty'>
  & Pick<ReturnType<typeof useHomeTripSelection>, 'isHomeSheetLockedRetracted' | 'latestTrips' | 'suggestionScopeLabel' | 'featuredPassengerTrip'>
  & Pick<ReturnType<typeof useHomeContext>, 'isDriver' | 'isScreenActive' | 'router'>
  & Pick<ReturnType<typeof useHomePassengerActivity>, 'availableDriverRequests' | 'bookedTripIds' | 'recentDestinations'>
  & Pick<ReturnType<typeof useHomeRequestHighlight>, 'highlightedDriverRequest'>
  & Pick<ReturnType<typeof useHomePriorityDismissals>, 'dismissPriority' | 'hiddenHomePriorities'>
  & Pick<ReturnType<typeof useHomeMapNavigation>, 'openTripRequestDetail' | 'openTripDetail'>
  & { prioritiesEnabled: boolean };

export const HomeTripsSheet = React.memo(function HomeTripsSheet({
  suggestionScopeLabel, sheetBottomOffset, sheetHeight, onSheetLayout,
  effectiveTripsSheetOpen, toggleTripsSheet, isHomeSheetLockedRetracted, sheetTitle,
  openSheetIndex, isDriver, isScreenActive, highlightedDriverRequest,
  dismissPriority, hiddenHomePriorities, prioritiesEnabled,
  availableDriverRequests, sheetLoading,
  sheetError, refetchSheetContent, openTripRequestDetail, latestTrips, bookedTripIds,
  openTripDetail, router, recentDestinations, featuredPassengerTrip,
}: Props) {
  const showRequests = isDriver;
  const clientCount = availableDriverRequests.length;
  const clientCountLabel = clientCount >= RECENT_TRIPS_LIMIT ? `${RECENT_TRIPS_LIMIT}+` : String(clientCount);
  const suggestionTrip = latestTrips.find(trip => !bookedTripIds.has(trip.id))
    ?? latestTrips.find(trip => trip.id !== featuredPassengerTrip?.id);
  const featuredRequest = availableDriverRequests.find(
    request => request.id !== highlightedDriverRequest?.id && !hiddenHomePriorities[homePriorityKeys.nearbyRequest(request)],
  );
  const hasSuggestion = showRequests ? Boolean(featuredRequest) : Boolean(suggestionTrip);

  return (
    <View onLayout={onSheetLayout} style={[styles.tripsSheet, { bottom: sheetBottomOffset, height: sheetHeight }]}>
      <TouchableOpacity activeOpacity={0.8} accessibilityRole="button"
        accessibilityLabel={effectiveTripsSheetOpen ? 'Agrandir la carte' : 'Afficher les suggestions'}
        accessibilityState={{ expanded: effectiveTripsSheetOpen, disabled: isHomeSheetLockedRetracted }}
        style={styles.sheetHandleButton} onPress={toggleTripsSheet} disabled={isHomeSheetLockedRetracted}>
        <View style={styles.sheetHandle} />
      </TouchableOpacity>
      {effectiveTripsSheetOpen ? (
        <ScrollView style={styles.dashboardScroll} contentContainerStyle={styles.dashboardContent}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <HomeEntryStatus />
          {isDriver ? (
            <>
              <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" style={styles.publishButton}
                onPress={() => router.push('/publish')}>
                <Ionicons name="add" size={20} color="#FFFFFF" accessible={false} />
                <Text style={styles.publishButtonText}>Publier un trajet</Text>
              </TouchableOpacity>
              <View style={styles.metricsRow}>
                <TouchableOpacity activeOpacity={0.8} style={styles.metricCard} accessibilityRole="button"
                  accessibilityLabel={`${clientCountLabel} clients disponibles`}
                  onPress={openSheetIndex}>
                  <Text style={styles.metricLabel}>Clients près de vous</Text>
                  <Text style={styles.metricValue}>{clientCountLabel}</Text>
                  <Text style={styles.metricHint}>commandes</Text>
                </TouchableOpacity>
                <HomeDriverEarnings active={isScreenActive} onPress={() => router.push('/driver-earnings')} />
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity activeOpacity={0.8} accessibilityRole="button"
                accessibilityLabel="Où allez-vous ?" accessibilityHint="Chercher un trajet publié ou commander un véhicule."
                style={styles.searchBar} onPress={() => router.push('/search')}>
                <Ionicons name="search-outline" size={24} color={HOME_DASHBOARD_COLORS.rust} accessible={false} />
                <View style={styles.searchCopy}>
                  <Text style={styles.searchPlaceholder}>Où allez-vous ?</Text>
                  <Text style={styles.searchHint}>Trajets publiés ou véhicule à commander</Text>
                </View>
              </TouchableOpacity>
              <HomeDestinationShortcuts active={isScreenActive} recentDestinations={recentDestinations} />
            </>
          )}
          <View testID="home-discovery-actions" style={styles.feedHeading}>
            <Text style={styles.feedTitle} accessibilityRole="header">
              {isDriver ? 'Clients' : suggestionScopeLabel ? 'Trajets pour vous' : 'Trajets près de vous'}
            </Text>
            <TouchableOpacity style={styles.seeAllButton} activeOpacity={0.8}
              accessibilityRole="button" accessibilityLabel={showRequests ? 'Voir tous les clients' : 'Voir tous les trajets'}
              accessibilityHint="Ouvrir la liste complète." onPress={openSheetIndex}>
              <Text style={styles.seeAllText}>Voir tout</Text>
              <Ionicons name="chevron-forward" size={16} color={HOME_DASHBOARD_COLORS.orange} accessible={false} />
            </TouchableOpacity>
          </View>
          {sheetLoading && !hasSuggestion ? <HomeSheetLoadingState active={isScreenActive} /> : null}
          {sheetError && !hasSuggestion ? (
            <View style={styles.stateRow}>
              <Text style={styles.stateText}>Chargement impossible.</Text>
              <TouchableOpacity style={styles.retryButton} onPress={refetchSheetContent} accessibilityRole="button">
                <Text style={styles.retryButtonText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!sheetLoading && !sheetError && !hasSuggestion ? (
            <View style={styles.emptyState}>
              <Ionicons name={showRequests ? 'people-outline' : 'car-outline'} size={22} color={HOME_DASHBOARD_COLORS.rust} accessible={false} />
              <Text style={styles.emptyText}>
                {showRequests
                  ? highlightedDriverRequest ? 'Le client le plus proche est sur la carte.' : 'Aucun nouveau client pour le moment.'
                  : featuredPassengerTrip ? 'Votre réservation est sur la carte.' : 'Aucun trajet disponible pour le moment.'}
              </Text>
            </View>
          ) : null}
          {showRequests && featuredRequest ? (
            <SwipeableHomePriority priorityKey={homePriorityKeys.nearbyRequest(featuredRequest)}
              enabled={prioritiesEnabled} onDismiss={dismissPriority}>
              <HomeSuggestionCard kind="request" item={featuredRequest}
                onOpen={openTripRequestDetail} />
            </SwipeableHomePriority>
          ) : null}
          {!showRequests && suggestionTrip ? (
            <HomeSuggestionCard kind="trip" item={suggestionTrip} onOpen={openTripDetail} booked={bookedTripIds.has(suggestionTrip.id)} />
          ) : null}
          {!isDriver && suggestionScopeLabel ? <Text style={styles.scopeLabel}>{suggestionScopeLabel}</Text> : null}
          {isDriver ? (
            <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" style={styles.secondaryAction}
              accessibilityLabel="Voyager comme passager" accessibilityHint="Commander un véhicule ou chercher un trajet publié."
              onPress={() => router.push('/search')}>
              <Ionicons name="person-outline" size={20} color="#FFFFFF" accessible={false} />
              <View style={styles.secondaryActionCopy}>
                <Text style={styles.secondaryActionTitle}>Voyager comme passager</Text>
                <Text style={styles.secondaryActionHint}>Commander ou chercher un trajet</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" accessible={false} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.8} accessibilityRole="button" style={styles.proposeLink}
              accessibilityLabel="Proposer un trajet" accessibilityHint="Vous avez un véhicule : publier un trajet."
              onPress={() => router.push('/publish')}>
              <Text style={styles.proposeLinkText}>
                Vous avez un véhicule ? <Text style={styles.proposeLinkAction}>Proposer un trajet</Text>
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      ) : (
        <TouchableOpacity activeOpacity={0.8} accessibilityRole="button"
          accessibilityLabel={`Afficher ${sheetTitle.toLowerCase()}`}
          accessibilityState={{ expanded: false, disabled: isHomeSheetLockedRetracted }}
          style={styles.collapsedRow} onPress={toggleTripsSheet} disabled={isHomeSheetLockedRetracted}>
          <Text style={styles.collapsedTitle}>{sheetTitle}</Text>
          <Ionicons name="chevron-up" size={20} color={HOME_DASHBOARD_COLORS.rust} accessible={false} />
        </TouchableOpacity>
      )}
    </View>
  );
});
