import React, { useMemo } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '@/features/home/HomeTripsSheet.styles';
import type { useHomeController } from '@/hooks/home/useHomeController';
import { HomeSheetLoadingState } from './HomeSheetLoadingState';
import { HomeSuggestionCard, type HomeSuggestion } from './HomeSuggestionCard';

type Props = Pick<ReturnType<typeof useHomeController>, 'sheetBottomOffset' | 'isDriver' | 'isRequestsSheetMode'
  | 'setHomeSheetMode' | 'openSheetIndex' | 'isScreenActive' | 'availableDriverRequests' | 'sheetLoading'
  | 'sheetError' | 'sheetOffline' | 'refetchSheetContent' | 'sheetEmpty' | 'openTripRequestDetail'
  | 'latestTrips' | 'bookedTripIds' | 'openTripDetail' | 'suggestionScopeLabel'> & { header: React.ReactElement };
export const HomeTripsSheet = React.memo(function HomeTripsSheet({ sheetBottomOffset, isDriver, isRequestsSheetMode,
  setHomeSheetMode, openSheetIndex, isScreenActive, availableDriverRequests, sheetLoading, sheetError, sheetOffline,
  refetchSheetContent, sheetEmpty, openTripRequestDetail, latestTrips, bookedTripIds, openTripDetail,
  suggestionScopeLabel, header }: Props) {
  const showRequests = isDriver && isRequestsSheetMode;
  const items = useMemo<HomeSuggestion[]>(() => showRequests
    ? availableDriverRequests.map(request => ({ kind: 'request', request }))
    : latestTrips.map(trip => ({ kind: 'trip', trip, isBooked: bookedTripIds.has(trip.id) })),
  [showRequests, availableDriverRequests, latestTrips, bookedTripIds]);
  const listHeader = <View>
    {header}
    <View style={styles.sheetHeader}>
      {isDriver ? <View style={styles.modes} accessibilityRole="tablist">
        {(['requests', 'trips'] as const).map(mode => {
          const selected = showRequests === (mode === 'requests');
          return <TouchableOpacity key={mode} style={[styles.mode, selected && styles.selectedMode]}
            accessibilityRole="tab" accessibilityState={{ selected }}
            accessibilityLabel={mode === 'requests' ? 'Clients' : 'Trajets'}
            accessibilityHint="Changer les suggestions dans la liste."
            onPress={() => setHomeSheetMode(mode)} activeOpacity={0.8}>
            <Text style={[styles.modeText, selected && styles.selectedModeText]}>{mode === 'requests' ? 'Clients' : 'Trajets'}</Text>
          </TouchableOpacity>;
        })}
      </View> : <Text style={styles.sheetTitle} accessibilityRole="header">Trajets pour vous</Text>}
      <TouchableOpacity style={styles.seeAllButton} accessibilityRole="button"
        accessibilityLabel={showRequests ? 'Voir tous les clients' : 'Voir tous les trajets'}
        activeOpacity={0.8} onPress={openSheetIndex}><Text style={styles.seeAllText}>Voir tout</Text></TouchableOpacity>
    </View>
    {!showRequests && suggestionScopeLabel && <Text style={styles.scopeLabel}>{suggestionScopeLabel}</Text>}
    {sheetOffline && <Text style={styles.stateText} accessibilityLiveRegion="polite">{sheetEmpty
      ? 'Hors ligne. Les résultats reviendront avec la connexion.'
      : 'Hors ligne · Derniers résultats enregistrés'}</Text>}
  </View>;
  const empty = sheetLoading ? <HomeSheetLoadingState active={isScreenActive} />
    : sheetError ? <View style={styles.state}>
      <Text style={styles.stateText}>Impossible de charger les résultats.</Text>
      <TouchableOpacity style={styles.retry} accessibilityRole="button" onPress={refetchSheetContent}>
        <Text style={styles.seeAllText}>Réessayer</Text>
      </TouchableOpacity>
    </View> : !sheetOffline ? <View style={styles.state}><Text style={styles.stateText}>
      {showRequests ? 'Pas de client pour le moment.' : 'Aucun trajet pour le moment. Essayez « Voir tout ».'}
    </Text></View> : null;

  return <View style={[styles.sheet, { marginBottom: sheetBottomOffset }]}>
    <View style={styles.handleArea} accessible={false}><View style={styles.handle} /></View>
    <FlatList
      // A single vertical list: header/actions scroll with it, no nested scroll views.
      key={showRequests ? 'clients' : 'trips'}
      data={items}
      style={styles.list}
      contentContainerStyle={styles.content}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={empty}
      keyExtractor={item => item.kind === 'trip' ? item.trip.id : item.request.id}
      renderItem={({ item }) => <HomeSuggestionCard item={item} onOpen={item.kind === 'trip' ? openTripDetail : openTripRequestDetail} />}
      initialNumToRender={2}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews={false}
      showsVerticalScrollIndicator={false}
    />
  </View>;
});
