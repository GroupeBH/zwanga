import { Colors } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { styles } from '@/features/home/HomeTripsSheet.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeDiscoveryMode } from '@/hooks/home/useHomeDiscoveryMode';
import type { useHomeMap } from '@/hooks/home/useHomeMap';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';
import type { useHomePassengerActivity } from '@/hooks/home/useHomePassengerActivity';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeTripSelection } from '@/hooks/home/useHomeTripSelection';
import { HomeSheetLoadingState } from './HomeSheetLoadingState';
import { TripPreviewCard } from './TripPreviewCard';
import { TripRequestPreviewCard } from './TripRequestPreviewCard';
type Props =
  Pick<ReturnType<typeof useHomeSheet>,
    'sheetBottomOffset'
    | 'sheetHeight'
    | 'onSheetLayout'
    | 'effectiveTripsSheetOpen'
    | 'toggleTripsSheet'
    | 'sheetTitle'
    | 'openSheetIndex'
    | 'sheetLoading'
    | 'sheetError'
    | 'refetchSheetContent'
    | 'sheetEmpty'
    | 'tripCardWidth'
  >
  & Pick<ReturnType<typeof useHomeTripSelection>,
    'isHomeSheetLockedRetracted'
    | 'latestTrips'
    | 'suggestionScopeLabel'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'isDriver'
    | 'isScreenActive'
  >
  & Pick<ReturnType<typeof useHomePassengerActivity>,
    'availableDriverRequests'
    | 'bookedTripIds'
  >
  & Pick<ReturnType<typeof useHomeMapNavigation>,
    'openTripRequestDetail'
    | 'openTripDetail'
  >
  & Pick<ReturnType<typeof useHomeMap>,
    'selectedTrip'
  > & ReturnType<typeof useHomeDiscoveryMode>;
export const HomeTripsSheet = React.memo(function HomeTripsSheet({
  sheetBottomOffset,
  sheetHeight,
  onSheetLayout,
  effectiveTripsSheetOpen,
  toggleTripsSheet,
  isHomeSheetLockedRetracted,
  sheetTitle,
  openSheetIndex,
  isDriver,
  isRequestsSheetMode = isDriver,
  setHomeSheetMode,
  isScreenActive,
  availableDriverRequests,
  sheetLoading,
  sheetError,
  refetchSheetContent,
  sheetEmpty,
  tripCardWidth,
  openTripRequestDetail,
  latestTrips,
  suggestionScopeLabel,
  bookedTripIds,
  selectedTrip,
  openTripDetail,
}: Props) {
  const showRequests = isDriver && isRequestsSheetMode;
  const toggleLabel = `${effectiveTripsSheetOpen ? 'Masquer' : 'Afficher'} les ${showRequests ? 'clients' : 'trajets'}`;
  return (<View onLayout={onSheetLayout} style={[styles.tripsSheet, {
    bottom: sheetBottomOffset,
    // Expanded content wraps naturally; collapsed controls also grow with large fonts.
    minHeight: effectiveTripsSheetOpen ? undefined : sheetHeight,
  }]}>
    <View style={styles.sheetHeader}>
      {isDriver && !isHomeSheetLockedRetracted ? (
        <View style={styles.sheetModeSwitch} accessibilityRole="tablist">
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="tab"
            accessibilityLabel="Clients"
            accessibilityHint="Afficher les clients sur la carte et dans la liste."
            accessibilityState={{ selected: showRequests }}
            style={[styles.sheetModeOption, showRequests && styles.sheetModeOptionActive]}
            onPress={() => setHomeSheetMode('requests')}
          >
            <Text style={[styles.sheetModeText, showRequests && styles.sheetModeTextActive]}>Clients</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.78}
            accessibilityRole="tab"
            accessibilityLabel="Trajets"
            accessibilityHint="Afficher les trajets publiés sur la carte et dans la liste."
            accessibilityState={{ selected: !showRequests }}
            style={[styles.sheetModeOption, !showRequests && styles.sheetModeOptionActive]}
            onPress={() => setHomeSheetMode('trips')}
          >
            <Text style={[styles.sheetModeText, !showRequests && styles.sheetModeTextActive]}>Trajets</Text>
          </TouchableOpacity>
        </View>
      ) : <TouchableOpacity
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded: effectiveTripsSheetOpen, disabled: isHomeSheetLockedRetracted }}
        style={styles.sheetHeaderCopy}
        onPress={toggleTripsSheet}
        disabled={isHomeSheetLockedRetracted}
      >
        <Text style={styles.sheetTitle} numberOfLines={2}>
          {sheetTitle}
        </Text>
      </TouchableOpacity>}
      <View style={styles.sheetHeaderActions}>
        <TouchableOpacity activeOpacity={0.75} onPress={openSheetIndex} style={styles.seeAllButton}
          accessibilityRole="button" accessibilityLabel={showRequests ? 'Voir tous les clients' : 'Voir tous les trajets'}>
          <Text style={styles.seeAllText}>Voir tout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          accessibilityState={{ expanded: effectiveTripsSheetOpen, disabled: isHomeSheetLockedRetracted }}
          style={styles.sheetToggle}
          onPress={toggleTripsSheet}
          disabled={isHomeSheetLockedRetracted}
        >
          <Ionicons
            name={effectiveTripsSheetOpen ? 'chevron-down' : 'chevron-up'}
            size={18}
            color={HOME_COLORS.ink}
          />
        </TouchableOpacity>
      </View>
    </View>

    {effectiveTripsSheetOpen && sheetLoading && (
      <HomeSheetLoadingState active={isScreenActive} />
    )}

    {effectiveTripsSheetOpen && sheetError && !sheetLoading && (
      <View style={styles.sheetState}>
        <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
        <Text style={styles.sheetStateText}>
          Chargement impossible.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetchSheetContent} accessibilityRole="button">
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    )}

    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && sheetEmpty && (
      <View style={styles.emptyCard}>
        <Ionicons name={showRequests ? 'people-outline' : 'car-outline'} size={22} color={HOME_COLORS.navy} accessible={false} />
        <Text style={styles.emptyText}>{showRequests ? 'Pas de client pour le moment.'
          : 'Aucun trajet disponible pour le moment. Essayez « Voir tout ».'}</Text>
      </View>
    )}

    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && showRequests && availableDriverRequests.length > 0 && (
      <FlatList
        key="clients"
        horizontal
        style={styles.tripsList}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tripsHorizontalContent}
        data={availableDriverRequests}
        keyExtractor={(request) => request.id}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        renderItem={({ item: request }) => (
          <TripRequestPreviewCard
            cardWidth={tripCardWidth}
            request={request}
            onOpen={openTripRequestDetail}
          />
        )}
      />
    )}

    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && !showRequests && suggestionScopeLabel && (
      <Text style={styles.scopeLabel}>{suggestionScopeLabel}</Text>
    )}
    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && !showRequests && latestTrips.length > 0 && (
      <FlatList
        key="trips"
        horizontal
        style={styles.tripsList}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tripsHorizontalContent}
        data={latestTrips}
        keyExtractor={(trip) => trip.id}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        renderItem={({ item: trip }) => (
          <TripPreviewCard
            cardWidth={tripCardWidth}
            trip={trip}
            isBooked={bookedTripIds.has(trip.id)}
            isSelected={trip.id === selectedTrip?.id}
            onOpen={openTripDetail}
          />
        )}
      />
    )}
  </View>);
});
