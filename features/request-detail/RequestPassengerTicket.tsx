import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import type { buildRequestDetailPresentation } from './requestPresentation';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { getTripRequestExpirationAt } from '@/features/trip-request/requestExpiration';
import { TRIP_REQUEST_VEHICLE_LABELS, formatCdfPrice } from './requestDetailModel';
import { CollapsibleRouteMap } from './CollapsibleRouteMap';
import { requestSummaryStyles as s } from './requestSummaryStyles';
import { RequestTargetDriver } from './RequestTargetDriver';
import { useRequestResponseWindow } from '@/hooks/request-detail/useRequestResponseWindow';

type Model = ReturnType<typeof useRequestDetailController>;
type Presentation = ReturnType<typeof buildRequestDetailPresentation>;
export function formatRequestTime(value: string | number) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
}
export function formatRequestDay(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date à confirmer';
  return date.toDateString() === new Date().toDateString() ? 'Aujourd’hui' : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function RequestPassengerTicket({ model, presentation }: { model: Model; presentation: Presentation }) {
  const request = model.tripRequest!;
  const response = useRequestResponseWindow(request, model.responseWindowStartedAt, model.isScreenActive, model.refetch, true);
  const labels = useRouteLocationLabels(request);
  const closed = ['cancelled', 'expired'].includes(request.status);
  const confirmed = request.status === 'driver_selected';
  const expiration = getTripRequestExpirationAt(request);
  const stage = confirmed ? 2 : 1; // A created trip is not proof that it has started.
  const steps = ['Commande envoyée', presentation.pendingOffersCount ? 'Réponse reçue' : request.targetDriverId ? 'Réponse du conducteur choisi' : 'Recherche d’un conducteur', 'Conducteur confirmé', 'Départ'];
  return <>
    {request.responseWindow?.phase === 'passenger' && !!response.label && <Text style={local.hint}>{response.label}</Text>}
    <View style={s.card}>
      <View style={s.row}>
        <Text style={s.label}>{formatRequestDay(request.departureDateMin).toLocaleUpperCase('fr-FR')}</Text>
        <Text style={s.label}>{TRIP_REQUEST_VEHICLE_LABELS[model.requestedVehicleType]} · {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}</Text>
      </View>
      <View style={s.row}>
        <View style={s.side}><Text style={s.time}>{formatRequestTime(request.departureDateMin)}</Text><Text style={s.label}>souhaité</Text></View>
        <Ionicons name="car-outline" size={21} color="#E64B14" />
        <View style={s.side}><Text style={[s.time, s.right]}>{formatRequestTime(request.departureDateMax)}</Text><Text style={[s.label, s.right]}>au plus tard</Text></View>
      </View>
      {formatRequestDay(request.departureDateMin) !== formatRequestDay(request.departureDateMax) && <Text style={[s.label, s.right]}>{formatRequestDay(request.departureDateMax)}</Text>}
      <View style={[s.row, local.addresses]}>
        <View style={s.side}><Text style={[s.label, { color: '#12813C' }]}>DÉPART</Text><Text style={s.address}>{labels.departure.title}</Text>
          {!!labels.departure.context && <Text style={s.muted}>{labels.departure.context}</Text>}
          {!!labels.departure.reference && <Text style={s.muted}>Référence : {labels.departure.reference}</Text>}</View>
        <View style={s.side}><Text style={[s.label, s.right, { color: '#CE4613' }]}>DESTINATION</Text><Text style={[s.address, s.right]}>{labels.arrival.title}</Text>
          {!!labels.arrival.context && <Text style={[s.muted, s.right]}>{labels.arrival.context}</Text>}
          {!!labels.arrival.reference && <Text style={[s.muted, s.right]}>Référence : {labels.arrival.reference}</Text>}</View>
      </View>
      <View style={local.perforation} pointerEvents="none">
        <View style={[s.dashed, local.perforationLine]} />
        <View style={[local.notch, { left: -12 }]} /><View style={[local.notch, { right: -12 }]} />
      </View>
      <CollapsibleRouteMap variant="light" mapData={presentation.requestRouteMapData} routeCoordinates={presentation.displayedRouteCoordinates}
        summary={<View style={s.side}><Text style={s.muted}>{confirmed ? 'Prix par place' : 'Budget par place'}</Text>
          <Text style={s.amount}>{presentation.ownerDisplayedBudget != null ? formatCdfPrice(presentation.ownerDisplayedBudget) : 'À convenir'}</Text></View>}
        departureName={labels.departure.address} arrivalName={labels.arrival.address} />
    </View>
    <RequestTargetDriver key={request.id} request={request} disabled={model.isCancelling || model.isUpdating} />
    <View style={s.card}>
      {closed ? <><Text style={s.name}>{presentation.ownerHero.title}</Text><Text style={s.muted}>{presentation.ownerHero.subtitle}</Text></>
        : steps.map((label, index) => <View key={label} style={local.step}>
          <View style={local.track}>
            <View style={[local.circle, index < stage && local.complete, index === stage && local.current]}>
              {index < stage && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
            </View>{index < steps.length - 1 && <View style={local.line} />}
          </View>
          <View style={local.stepText}><Text style={[s.muted, index === stage && s.name]}>{label}</Text>
            {index === stage && <Text style={local.hint}>{confirmed
              ? `${request.selectedDriverName || 'Votre conducteur'} a accepté. Retrouvez-le dans votre trajet.`
              : presentation.pendingOffersCount ? 'Un conducteur a répondu. Le conducteur confirmé apparaîtra ici.'
                : request.targetDriverDeclined ? 'Le conducteur a refusé. Vous pouvez envoyer la commande aux conducteurs proches.'
                  : request.targetDriverId ? 'Vous serez alerté dès que ce conducteur répond. Vous pouvez quitter l’application.'
                    : 'Vous serez alerté dès qu’un conducteur répond. Vous pouvez quitter l’application.'}</Text>}
            {index === stage && !confirmed && expiration != null && <Text style={local.hint}>Sans réponse, la commande expire le {new Date(expiration).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à {formatRequestTime(expiration)}.</Text>}
          </View>
        </View>)}
      {request.selectedDriverRequiresPassengerKyc && <Text style={s.muted}>Ce conducteur demande une identité vérifiée avant le départ.</Text>}
    </View>
  </>;
}

export function RequestPassengerActions({ model }: { model: Model }) {
  // A background read must not keep the essential actions disabled on a slow connection.
  // Edit/cancel mutations retain the existing server-side state/snapshot checks.
  const busy = model.isCancelling || model.isUpdating;
  return <View style={s.footer}><View style={s.actionRow}>
    {model.canCancel && <Pressable accessibilityRole="button" accessibilityLabel="Annuler la commande" disabled={busy}
      style={[s.cancel, busy && s.disabled]} onPress={model.handleCancelRequest}>
      {model.isCancelling ? <ActivityIndicator color="#BF1B20" /> : <Text style={s.cancelText}>Annuler</Text>}
    </Pressable>}
    {model.tripRequest?.tripId ? <Pressable accessibilityRole="button" style={s.primary} onPress={() => model.handleViewTrip(model.tripRequest!.tripId!)}>
      <Text style={s.primaryText}>Voir mon trajet</Text>
    </Pressable> : model.canEdit && <Pressable accessibilityRole="button" disabled={busy} style={[s.primary, busy && s.disabled]} onPress={model.handleOpenEditForm}>
      <Text style={s.primaryText}>{model.tripRequest?.status === 'expired' ? 'Reprogrammer la commande' : 'Modifier la commande'}</Text>
    </Pressable>}
  </View></View>;
}
const local = StyleSheet.create({
  perforation: { marginHorizontal: -20, marginVertical: 8 }, perforationLine: { marginHorizontal: 20, marginVertical: 0 },
  notch: { position: 'absolute', top: -12, width: 24, height: 24, borderRadius: 12, backgroundColor: '#F2EEE9' },
  addresses: { alignItems: 'flex-start' }, step: { flexDirection: 'row', gap: 12 }, track: { alignItems: 'center', width: 22 },
  circle: { width: 22, height: 22, borderRadius: 12, borderWidth: 1.5, borderColor: '#D9E0E8', alignItems: 'center', justifyContent: 'center' },
  complete: { backgroundColor: '#16A34A', borderColor: '#16A34A' }, current: { borderWidth: 5, borderColor: '#F65B1C' },
  line: { width: 1, flex: 1, minHeight: 12, backgroundColor: '#D9E0E8', marginTop: 2, marginBottom: -12 },
  stepText: { flex: 1, gap: 4, paddingBottom: 8 }, hint: { fontSize: 13, lineHeight: 19, color: '#536071' },
});
