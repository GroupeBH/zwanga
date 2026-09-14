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
    | 'effectiveTripsSheetOpen'
    | 'toggleTripsSheet'
    | 'sheetTitle'
    | 'sheetSubtitle'
    | 'openSheetIndex'
    | 'isRequestsSheetMode'
    | 'setHomeSheetMode'
    | 'sheetLoading'
    | 'sheetError'
    | 'refetchSheetContent'
    | 'sheetEmpty'
    | 'tripCardWidth'
  >
  & Pick<ReturnType<typeof useHomeTripSelection>,
    'isHomeSheetLockedRetracted'
    | 'latestTrips'
  >
  & Pick<ReturnType<typeof useHomeContext>,
    'isDriver'
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
  >;
export const HomeTripsSheet = React.memo(function HomeTripsSheet({
  sheetBottomOffset,
  sheetHeight,
  effectiveTripsSheetOpen,
  toggleTripsSheet,
  isHomeSheetLockedRetracted,
  sheetTitle,
  sheetSubtitle,
  openSheetIndex,
  isDriver,
  isRequestsSheetMode,
  setHomeSheetMode,
  availableDriverRequests,
  sheetLoading,
  sheetError,
  refetchSheetContent,
  sheetEmpty,
  tripCardWidth,
  openTripRequestDetail,
  latestTrips,
  bookedTripIds,
  selectedTrip,
  openTripDetail,
}: Props) {
  return (<View style={[styles.tripsSheet, { bottom: sheetBottomOffset, height: sheetHeight }]}>
    <View style={styles.sheetHeader}>
      <TouchableOpacity
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={effectiveTripsSheetOpen ? 'Rétracter la liste des trajets' : 'Afficher la liste des trajets'}
        style={styles.sheetHeaderCopy}
        onPress={toggleTripsSheet}
        disabled={isHomeSheetLockedRetracted}
      >
        <Text style={styles.sheetTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
          {sheetTitle}
        </Text>
        <Text style={styles.sheetSubtitle} numberOfLines={1}>
          {sheetSubtitle}
        </Text>
      </TouchableOpacity>
      <View style={styles.sheetHeaderActions}>
        <TouchableOpacity activeOpacity={0.75} onPress={openSheetIndex}>
          <Text style={styles.seeAllText} numberOfLines={1}>Voir tout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={effectiveTripsSheetOpen ? 'Rétracter la liste des trajets' : 'Afficher la liste des trajets'}
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

    {effectiveTripsSheetOpen && isDriver && (
      <View style={styles.sheetModeSwitch}>
        <TouchableOpacity
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityState={{ selected: !isRequestsSheetMode }}
          style={[styles.sheetModeOption, !isRequestsSheetMode && styles.sheetModeOptionActive]}
          onPress={() => setHomeSheetMode('trips')}
        >
          <Ionicons
            name="car-outline"
            size={15}
            color={!isRequestsSheetMode ? Colors.white : HOME_COLORS.navy}
          />
          <Text
            style={[styles.sheetModeText, !isRequestsSheetMode && styles.sheetModeTextActive]}
            numberOfLines={1}
          >
            Trajets
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityState={{ selected: isRequestsSheetMode }}
          style={[styles.sheetModeOption, isRequestsSheetMode && styles.sheetModeOptionActive]}
          onPress={() => setHomeSheetMode('requests')}
        >
          <Ionicons
            name="document-text-outline"
            size={15}
            color={isRequestsSheetMode ? Colors.white : HOME_COLORS.navy}
          />
          <Text
            style={[styles.sheetModeText, isRequestsSheetMode && styles.sheetModeTextActive]}
            numberOfLines={1}
          >
            Demandes
          </Text>
          {availableDriverRequests.length > 0 && (
            <View style={[styles.sheetModeCountBadge, isRequestsSheetMode && styles.sheetModeCountBadgeActive]}>
              <Text style={[styles.sheetModeCountText, isRequestsSheetMode && styles.sheetModeCountTextActive]}>
                {availableDriverRequests.length > 9 ? '9+' : availableDriverRequests.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    )}

    {effectiveTripsSheetOpen && sheetLoading && (
      <HomeSheetLoadingState />
    )}

    {effectiveTripsSheetOpen && sheetError && !sheetLoading && (
      <View style={styles.sheetState}>
        <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
        <Text style={styles.sheetStateText}>
          Impossible de charger les {isRequestsSheetMode ? 'demandes' : 'trajets'}.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={refetchSheetContent}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    )}

    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && sheetEmpty && (
      <View style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons
            name={isRequestsSheetMode ? 'document-text-outline' : 'car-outline'}
            size={24}
            color={HOME_COLORS.navy}
          />
        </View>
        <View style={styles.emptyTextBlock}>
          <Text style={styles.emptyTitle}>
            {isRequestsSheetMode ? 'Aucune demande disponible' : 'Aucun trajet disponible'}
          </Text>
          <Text style={styles.emptyText}>
            {isRequestsSheetMode
              ? 'Revenez plus tard pour accepter une demande passager.'
              : 'Publiez le vôtre ou revenez plus tard.'}
          </Text>
        </View>
      </View>
    )}

    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && isRequestsSheetMode && availableDriverRequests.length > 0 && (
      <FlatList
        horizontal
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

    {effectiveTripsSheetOpen && !sheetLoading && !sheetError && !isRequestsSheetMode && latestTrips.length > 0 && (
      <FlatList
        horizontal
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
