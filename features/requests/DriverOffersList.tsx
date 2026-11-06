import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useGetMyOfferPageQuery } from '@/store/api/tripRequestApi';
import { useAppSelector } from '@/store/hooks';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { displayReadOptions, useDisplayReadData, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useHistoryCursor } from '@/hooks/useHistoryCursor';
import { HistoryPagination } from '@/components/ui/HistoryPagination';
import { CompactTripCard } from '@/components/trip/CompactTripCard';
import { homePriceLabel, homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { isTripRequestWithinAcceptanceWindow } from '@/features/trip-request/requestExpiration';
import { Colors } from '@/constants/styles';
import { styles } from '@/features/screen-styles/app/requests';
import type { DriverOfferWithTripRequest } from '@/types';
import { RequestsListState } from './RequestsListState';

const EMPTY_OFFERS: DriverOfferWithTripRequest[] = [];
const labels = { pending: 'En attente du passager', accepted: 'Proposition acceptée', rejected: 'Prix refusé', cancelled: 'Proposition retirée' };
const keyFor = (offer: DriverOfferWithTripRequest) => offer.id;

export function DriverOffersList({ onOpen }: { onOpen: (requestId: string) => void }) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active && Boolean(userId));
  const cursor = useHistoryCursor(`${userId}:my-offers`);
  const query = useGetMyOfferPageQuery({ before: cursor.before, limit: 20 }, displayReadOptions(enabled, 15_000));
  const page = useDisplayReadData(`${userId}:my-offers:${cursor.before ?? ''}`, query.currentData);
  const records = page?.data ?? EMPTY_OFFERS;
  const offers = useMemo(() => records.filter(offer => offer.driverId === userId), [records, userId]);
  const refresh = useCallback(() => {
    if (enabled && !query.isFetching && !query.isUninitialized) void query.refetch();
  }, [enabled, query]);
  const loading = enabled && (query.isLoading || query.isUninitialized);
  const error = (active && !enabled) || query.isError;
  const renderItem = useCallback(({ item: offer }: { item: DriverOfferWithTripRequest }) => {
    const request = offer.tripRequest;
    const open = (offer.status === 'pending' && ['pending', 'offers_received'].includes(request.status) &&
      isTripRequestWithinAcceptanceWindow(request)) || (offer.status === 'accepted' && request.status === 'driver_selected');
    const name = [request.passenger.firstName, request.passenger.lastName].filter(Boolean).join(' ') || 'Passager Zwanga';
    return <CompactTripCard label={!open && offer.status === 'pending' ? 'Commande fermée' : labels[offer.status]}
      labelColor={open ? Colors.primary : Colors.gray[600]} disabled={!open}
      departure={request.departureLocation} arrival={request.arrivalLocation}
      priceText={homePriceLabel(offer.pricePerSeat)} priceHint="proposé / place"
      metadata={`${homeRequestDepartureLabel(request.departureDateMin, request.departureDateMax)} · ${homeSeatsLabel(request.numberOfSeats)}`}
      avatarName={name} avatarUri={request.passenger.profilePicture} secondary={name}
      badge={open ? 'Voir la commande' : undefined} accessibilityLabel={`${labels[offer.status]} : ${request.departureLocation} vers ${request.arrivalLocation}`}
      onPress={() => { if (open) onOpen(request.id); }} />;
  }, [onOpen]);
  return <FlatList data={offers} keyExtractor={keyFor} renderItem={renderItem}
    initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} style={styles.list}
    contentContainerStyle={[styles.listContent, !offers.length && styles.emptyListContent]}
    refreshControl={<RefreshControl refreshing={Boolean(enabled && query.isFetching && !query.isLoading)} onRefresh={refresh} tintColor={Colors.primary} />}
    ListHeaderComponent={offers.length ? <View style={styles.resultsHeader}>
      <Text style={styles.resultsHint}>{error ? 'Actualisation impossible. Dernières commandes affichées.' : 'Vos prix et les réponses des passagers restent dans chaque commande.'}</Text>
    </View> : null}
    ListEmptyComponent={<RequestsListState loading={Boolean(loading)} error={Boolean(error)} searching={false}
      busy={query.isFetching} tab="my-offers" onRetry={refresh} onClearSearch={() => {}} />}
    ListFooterComponent={<HistoryPagination page={cursor.page} hasNext={Boolean(page?.nextCursor)} busy={!enabled || query.isFetching}
      error={query.isError} onPrevious={cursor.previous} onNext={() => cursor.next(page?.nextCursor)} onRetry={refresh} />} />;
}
