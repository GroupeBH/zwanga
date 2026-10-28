import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUserLocation } from '@/hooks/useUserLocation';
import { displayReadOptions, useDisplayReadData, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { useGetRequestSearchMapQuery } from '@/store/api/requestSearchApi';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import type { buildRequestDetailPresentation } from './requestPresentation';
import { requestSearchPhase, searchVehicles, searchPassengerPosition } from './requestSearchModel';
import { RequestSearchMap } from './RequestSearchMap';
import { RequestPassengerActions, formatRequestDay, formatRequestTime } from './RequestPassengerTicket';
import { RequestOwnerModals } from './RequestOwnerModals';
import { RequestTargetDriver } from './RequestTargetDriver';
import { SharedTripPanel } from './SharedTripPanel';
import { formatCdfPrice } from './requestDetailModel';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { useRequestResponseWindow } from '@/hooks/request-detail/useRequestResponseWindow';

type Model = ReturnType<typeof useRequestDetailController>;
function ResponseWindow({ model }: { model: Model }) {
  const response = useRequestResponseWindow(model.tripRequest, model.responseWindowStartedAt, model.isScreenActive, model.refetch, true);
  return model.tripRequest?.responseWindow?.phase === 'passenger' && response.label ? <Text style={s.hint}>{response.label}</Text> : null;
}

export function RequestSearchScreen({ model, presentation, onLayout }: {
  model: Model; presentation: ReturnType<typeof buildRequestDetailPresentation>; onLayout: (event: LayoutChangeEvent) => void;
}) {
  const request = model.tripRequest!;
  const active = model.isScreenActive && !model.showEditForm && !model.editLocationPickerType;
  const readsEnabled = useDisplayReadsEnabled(active);
  const { currentData, isError, isFetching, refetch, fulfilledTimeStamp } = useGetRequestSearchMapQuery(request.id, displayReadOptions(readsEnabled, 30_000));
  const cached = useDisplayReadData(request.id, currentData ? { snapshot: currentData, receivedAt: fulfilledTimeStamp } : undefined);
  const snapshot = cached?.snapshot;
  const retry = useDisplayRefetch(readsEnabled, request.id, refetch);
  const { lastKnownLocation } = useUserLocation({ autoRequest: active, trackingProfile: 'nearby' });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [active]);
  const receivedAt = cached?.receivedAt;
  const phase = requestSearchPhase(request, snapshot, now, receivedAt);
  const vehicles = useMemo(() => phase === 'searching' ? searchVehicles(snapshot, request.id, now, receivedAt) : [], [phase, snapshot, request.id, now, receivedAt]);
  const position = useMemo(() => searchPassengerPosition(lastKnownLocation, now), [lastKnownLocation, now]);
  const total = vehicles.length;
  const labels = useRouteLocationLabels(request);
  const departure = presentation.requestRouteMapData?.departureCoordinate ?? null;
  const readFailed = isError || !!model.error || !readsEnabled || !!snapshot && !Array.isArray(snapshot.vehicles);
  return <SafeAreaView style={s.screen} onLayout={onLayout}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retour à l’accueil" onPress={model.goHome} style={s.back}>
        <Ionicons name="arrow-back" size={22} color="#1C2433" />
      </Pressable><Text style={s.heading}>Votre demande</Text>
      <View style={s.badge}><View style={s.dot} /><Text style={s.badgeText}>{phase === 'past-departure' ? 'Horaire à modifier' : 'En attente'}</Text></View>
    </View>
    <RequestSearchMap requestId={request.id} active={active} departure={departure} position={position} vehicles={vehicles} />
    <View style={s.panel}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text accessibilityRole="header" style={s.title}>{phase === 'past-departure' ? 'L’heure de départ est dépassée' :
          phase === 'inactive' ? 'Votre demande a changé' : request.targetDriverDeclined ? 'Choisissez un autre conducteur' :
          request.targetDriverId ? 'En attente de votre conducteur' : 'On cherche votre conducteur'}</Text>
        <Text style={s.subtitle}>{phase === 'past-departure' ? 'Les conducteurs ne sont plus contactés. Modifiez l’heure de départ pour relancer la recherche. Votre demande reste enregistrée.' :
          phase === 'inactive' ? 'Actualisez pour consulter son état. Vous pouvez toujours revenir à l’accueil.' : readFailed ? 'Positions indisponibles pour le moment. Votre demande reste enregistrée.' : isFetching && !snapshot
          ? 'Recherche des conducteurs proches…' : total > 0
            ? `${total} véhicule${total > 1 ? 's' : ''} sur la carte${snapshot?.truncated ? ' (les plus proches)' : ''}. Vous serez prévenu dès qu’un conducteur accepte.`
            : 'Aucune position à afficher pour le moment. Votre demande reste en attente d’une réponse.'}</Text>
        {(readFailed || phase === 'inactive') && <Pressable accessibilityRole="button" disabled={!readsEnabled || isFetching} onPress={() => { void retry(); void model.refetch(); }} style={s.retry}>
          <Text style={s.link}>Actualiser</Text>
        </Pressable>}
        <Text style={s.hint}>Dernières positions connues · 5 km autour du départ. Touchez un véhicule pour voir depuis quand.</Text>
        {vehicles.some(vehicle => vehicle.ageMs >= 10 * 60_000) && <Text style={s.hint}>Les véhicules plus pâles ont une position ancienne.</Text>}
        <ResponseWindow model={model} />
        <View style={s.route}>
          <View style={s.routeLine}><Ionicons name="radio-button-on" size={16} color="#30805C" /><Text style={s.address} numberOfLines={2}>{labels.departure.title}</Text></View>
          <View style={s.routeLine}><Ionicons name="location" size={16} color="#DB4D1B" /><Text style={s.address} numberOfLines={2}>{labels.arrival.title}</Text></View>
          <Text style={s.hint}>{formatRequestDay(request.departureDateMin)} · {formatRequestTime(request.departureDateMin)}–{formatRequestTime(request.departureDateMax)} · {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}</Text>
          <Text style={s.price}>{request.maxPricePerSeat != null ? `${formatCdfPrice(request.maxPricePerSeat)} / place` : 'Budget à convenir'}</Text>
        </View>
        <RequestTargetDriver key={request.id} request={request} disabled={model.isCancelling || model.isUpdating} />
        <SharedTripPanel requestId={request.id} isOwner readsEnabled={readsEnabled} seats={request.numberOfSeats}
          hasPendingOffer={false} refresh={model.refetch} />
      </ScrollView>
    </View>
    <RequestPassengerActions model={model} />
    <RequestOwnerModals model={model} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F4F6', alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C2433' },
  badge: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#FFF2DB', padding: 9, borderRadius: 20 },
  badgeText: { color: '#904516', fontSize: 12, fontWeight: '600' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#DC6516' },
  panel: { maxHeight: '46%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -16, overflow: 'hidden' },
  content: { padding: 20, gap: 10 }, title: { fontSize: 23, lineHeight: 29, fontWeight: '700', color: '#1C2433' },
  subtitle: { fontSize: 15, lineHeight: 22, color: '#4C5968' }, hint: { fontSize: 12, lineHeight: 18, color: '#657080' },
  route: { borderTopWidth: 1, borderColor: '#EBEEF1', paddingTop: 12, marginTop: 2, gap: 7 },
  routeLine: { flexDirection: 'row', gap: 10, alignItems: 'center' }, address: { flex: 1, fontSize: 15, fontWeight: '600', color: '#283141' },
  price: { color: '#B83D0D', fontSize: 16, fontWeight: '700' }, retry: { minHeight: 44, justifyContent: 'center' },
  link: { color: '#B83D0D', fontWeight: '700', fontSize: 15 },
});
