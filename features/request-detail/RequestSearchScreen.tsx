import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { MapDriverSelection } from './MapDriverSelection';
import { RequestPassengerActions, formatRequestDay, formatRequestTime } from './RequestPassengerTicket';
import { RequestOwnerModals } from './RequestOwnerModals';
import { RequestTargetDriver } from './RequestTargetDriver';
import { SharedTripPanel } from './SharedTripPanel';
import { formatCdfPrice } from './requestDetailModel';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { useRequestResponseWindow } from '@/hooks/request-detail/useRequestResponseWindow';
import { MAX_INDIVIDUAL_SEARCH_MARKERS } from './requestVehicleClusters';

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
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const expanded = expandedRequest === request.id;
  const phase = requestSearchPhase(request, snapshot, now, receivedAt);
  const vehicles = useMemo(() => phase === 'searching' ? searchVehicles(snapshot, request.id, now, receivedAt) : [], [phase, snapshot, request.id, now, receivedAt]);
  const position = useMemo(() => searchPassengerPosition(lastKnownLocation, now), [lastKnownLocation, now]);
  const total = vehicles.length;
  const labels = useRouteLocationLabels(request);
  const departure = presentation.requestRouteMapData?.departureCoordinate ?? null;
  const readFailed = isError || !!model.error || !readsEnabled || !!snapshot && !Array.isArray(snapshot.vehicles);
  const [choice, setChoice] = useState<{ requestId: string; vehicleId: string } | null>(null);
  const canChoose = active && readsEnabled && !readFailed && phase === 'searching' && !request.targetDriverPriorityUntil &&
    !request.selectedDriverId && !request.tripId && !model.isCancelling && !model.isUpdating;
  const selectVehicle = useCallback((vehicleId: string) => {
    if (canChoose) setChoice({ requestId: request.id, vehicleId });
  }, [canChoose, request.id]);
  const choosing = choice?.requestId === request.id && !request.targetDriverPriorityUntil;
  return <SafeAreaView style={s.screen} onLayout={onLayout}>
    <View style={s.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Retour à l’accueil" onPress={model.goHome} style={s.back}>
        <Ionicons name="arrow-back" size={22} color="#1C2433" />
      </Pressable><Text style={s.heading}>Votre demande</Text>
      <View style={s.badge}><View style={s.dot} /><Text style={s.badgeText}>{phase === 'past-departure' ? 'Horaire à modifier' : 'En attente'}</Text></View>
    </View>
    <RequestSearchMap requestId={request.id} active={active} departure={departure} position={position} vehicles={vehicles} onSelectVehicle={selectVehicle} />
    <View style={[s.panel, expanded && s.expandedPanel]} testID="request-search-panel">
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {choosing ? <MapDriverSelection key={`${request.id}:${choice.vehicleId}`} request={request}
          vehicle={vehicles.find(vehicle => vehicle.id === choice.vehicleId)} disabled={!canChoose} onClose={() => setChoice(null)} /> : <>
        <View style={s.statusRow}>
          <View style={s.status}>
            <Text accessibilityRole="header" style={s.title}>{phase === 'past-departure' ? 'L’heure de départ est dépassée' :
              phase === 'inactive' ? 'Votre demande a changé' : request.targetDriverDeclined ? 'Choisissez un autre conducteur' :
              request.targetDriverId ? 'En attente du conducteur' : 'Recherche en cours'}</Text>
            <Text style={s.hint}>{phase === 'past-departure' ? 'Modifiez l’heure de départ pour reprendre.' :
              phase === 'inactive' ? 'Actualisez pour voir la réponse.' : readFailed ? 'Positions indisponibles · demande conservée' :
                isFetching && !snapshot ? 'Chargement des positions…' : total > 0
                  ? `${total} véhicule${total > 1 ? 's' : ''} · positions connues · 5 km`
                  : 'En attente d’un conducteur'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Réduire les détails de la recherche' : 'Voir les détails de la recherche'}
            accessibilityState={{ expanded }} style={s.detailsButton} onPress={() => setExpandedRequest(expanded ? null : request.id)}>
            <Text style={s.detailsLabel}>{expanded ? 'Réduire' : 'Détails'}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color="#536071" />
          </Pressable>
        </View>
        {(readFailed || phase === 'inactive') && <Pressable accessibilityRole="button" disabled={!readsEnabled || isFetching} onPress={() => { void retry(); void model.refetch(); }} style={s.retry}>
          <Text style={s.link}>Actualiser</Text>
        </Pressable>}
        {expanded && <View style={s.details}>
          <Text style={s.hint}>{phase === 'past-departure' ? 'Les conducteurs ne sont plus contactés. Votre demande reste enregistrée.' :
            phase === 'inactive' ? 'Votre demande a changé. Consultez sa réponse avant de continuer.' :
              readFailed ? 'Votre demande reste enregistrée. Réessayez pour afficher les positions.' :
                total ? `${total} véhicule${total > 1 ? 's' : ''} sur la carte${snapshot?.truncated ? ' (les plus proches)' : ''}. Une position ne garantit pas la disponibilité.` :
                  'Aucune position transmise pour le moment. Votre demande reste en attente d’une réponse.'}</Text>
          <Text style={s.hint}>Dernières positions connues · 5 km autour du départ. Touchez une voiture, une moto ou un tricycle pour voir depuis quand.</Text>
          {total > MAX_INDIVIDUAL_SEARCH_MARKERS && <Text style={s.hint}>Touchez un groupe de véhicules pour agrandir la carte.</Text>}
          {vehicles.some(vehicle => vehicle.ageMs >= 10 * 60_000) && <Text style={s.hint}>Les véhicules plus pâles ont une position ancienne.</Text>}
        </View>}
        <ResponseWindow model={model} />
        {canChoose && total > 0 && <Text style={s.hint}>Touchez un véhicule pour choisir ce conducteur.</Text>}
        <RequestTargetDriver key={request.id} request={request} disabled={!active || !readsEnabled || model.isCancelling || model.isUpdating} />
        <View style={s.route}>
          <View style={s.routeLine}><Ionicons name="radio-button-on" size={14} color="#30805C" /><Text accessibilityLabel={`Départ : ${labels.departure.title}`} style={s.address} numberOfLines={expanded ? undefined : 1}>{labels.departure.title}</Text></View>
          <View style={s.routeLine}><Ionicons name="location" size={14} color="#DB4D1B" /><Text accessibilityLabel={`Destination : ${labels.arrival.title}`} style={s.address} numberOfLines={expanded ? undefined : 1}>{labels.arrival.title}</Text></View>
          <View style={s.meta}>
            <Text style={s.schedule}>{formatRequestDay(request.departureDateMin)} · {formatRequestTime(request.departureDateMin)}–{formatRequestTime(request.departureDateMax)} · {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}</Text>
            <Text style={s.price}>{request.maxPricePerSeat != null ? `${formatCdfPrice(request.maxPricePerSeat)} / place` : 'Budget à convenir'}</Text>
          </View>
        </View>
        <SharedTripPanel requestId={request.id} isOwner readsEnabled={readsEnabled} seats={request.numberOfSeats}
          hasPendingOffer={false} refresh={model.refetch} />
        </>}
      </ScrollView>
    </View>
    <RequestPassengerActions model={model} />
    <RequestOwnerModals model={model} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, gap: 10 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F4F6', alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1C2433' },
  badge: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#FFF2DB', padding: 9, borderRadius: 20 },
  badgeText: { color: '#904516', fontSize: 12, fontWeight: '600' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#DC6516' },
  panel: { maxHeight: '34%', flexShrink: 1, backgroundColor: '#FFFFFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, marginTop: -16, overflow: 'hidden' },
  expandedPanel: { maxHeight: '48%' }, content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8 },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, status: { flex: 1, gap: 3 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: '#1C2433' },
  hint: { fontSize: 12, lineHeight: 17, color: '#657080' }, details: { gap: 6, paddingBottom: 2 },
  detailsButton: { minHeight: 44, minWidth: 64, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'flex-end' },
  detailsLabel: { fontSize: 12, color: '#536071', fontWeight: '600' },
  route: { borderTopWidth: 1, borderColor: '#EBEEF1', paddingTop: 8, gap: 5 },
  routeLine: { flexDirection: 'row', gap: 8, alignItems: 'center' }, address: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#283141' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'space-between', alignItems: 'center', paddingTop: 3 },
  schedule: { fontSize: 11, lineHeight: 16, color: '#657080', flexShrink: 1 },
  price: { color: '#B83D0D', fontSize: 14, lineHeight: 19, fontWeight: '700' }, retry: { minHeight: 44, justifyContent: 'center' },
  link: { color: '#B83D0D', fontWeight: '700', fontSize: 15 },
});
