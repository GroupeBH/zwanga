import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRequestResponseWindow } from '@/hooks/request-detail/useRequestResponseWindow';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { Colors } from '@/constants/styles';
import { RouteLocationDetails } from '@/components/trip/RouteLocationDetails';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { CashCommissionNotice } from '@/features/driver-payments/CashCommissionNotice';
import { RequestPassengerContact } from './RequestPassengerContact';
import { TRIP_REQUEST_VEHICLE_LABELS, formatCdfPrice } from './requestDetailModel';
import { RequestDecisionVehiclePicker } from './RequestDecisionVehiclePicker';
import { RequestDecisionOptions } from './RequestDecisionOptions';
import { CollapsibleRouteMap } from './CollapsibleRouteMap';
import type { buildRequestDetailPresentation } from './requestPresentation';

type Model = ReturnType<typeof useRequestDetailController>;

/** The route and optional details scroll independently from the response controls. */
export function RequestDriverDecision({ model, presentation }: {
  model: Model; presentation: ReturnType<typeof buildRequestDetailPresentation>;
}) {
  const request = model.tripRequest!;
  const route = useRouteLocationLabels(request);
  const busy = model.isAcceptingTripRequest || model.isStartingTrip || !model.canRespondToRequest;
  const price = request.maxPricePerSeat;
  return <View style={styles.content}>
    <View style={styles.summary}>
      {!!request.targetDriverId && <Text style={styles.schedule}>Ce passager vous a choisi</Text>}
      <View style={styles.summaryTop}>
        <View style={styles.passengerCopy}>
          <Text style={styles.passenger}>{request.passengerName || 'Un passager'}</Text>
          <Text style={styles.muted}>{request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''} · {TRIP_REQUEST_VEHICLE_LABELS[model.requestedVehicleType]}</Text>
        </View>
        <View style={styles.fare}>
          <Text style={styles.amount}>{price != null ? formatCdfPrice(price) : 'Prix à convenir'}</Text>
          {price != null && <Text style={styles.priceLabel}>Budget par place</Text>}
        </View>
      </View>
      <Text style={styles.schedule}>{formatDateWithRelativeLabel(request.departureDateMin, true)}</Text>
      <RouteLocationDetails labels={route} compact />
      <Text style={styles.muted}>{request.paymentMode === 'cash' ? 'Cash à l’arrivée' : request.paymentMode === 'points' ? 'Paiement par jetons' : 'Paiement électronique'}</Text>
      <CollapsibleRouteMap
        key={`${request.id}:${request.departure?.lat},${request.departure?.lng}:${request.arrival?.lat},${request.arrival?.lng}`}
        variant="light" initiallyExpanded={false} toggleAppearance="text"
        expandLabel="Voir le trajet sur la carte"
        mapData={presentation.requestRouteMapData} routeCoordinates={presentation.displayedRouteCoordinates}
        departureName={route.departure.title} arrivalName={route.arrival.title} />
    </View>
    <View style={styles.secondary}>
    {model.canAcceptDirectly && request.paymentMode === 'cash' && price != null &&
      <CashCommissionNotice amount={Number(price) * request.numberOfSeats} />}
    {model.isIdentityVerified && <RequestPassengerContact requestId={request.id} enabled={!busy && !model.showDirectAcceptModal} />}
    {model.canAcceptDirectly && <RequestDecisionOptions model={model} disabled={busy} />}
    </View>
  </View>;
}

export function RequestDecisionActions({ model }: { model: Model }) {
  const response = useRequestResponseWindow(model.tripRequest, model.responseWindowStartedAt, model.isScreenActive, model.refetch);
  const busy = model.isAcceptingTripRequest || model.isStartingTrip;
  const disabled = busy || !model.canRespondToRequest || response.closed;
  const canAccept = model.canAcceptDirectly && Boolean(model.directAcceptVehicle) && !disabled && !response.blocked;
  return <View style={styles.footer}>
    {!!response.label && <Text style={styles.hint}>{busy ? 'Confirmation du trajet en cours…' : response.label}</Text>}
    {model.canAcceptDirectly && <RequestDecisionVehiclePicker key={`${model.userId}:${model.tripRequest?.id}`} model={model} disabled={disabled} />}
    {!model.isIdentityVerified ? <Pressable accessibilityRole="button" disabled={disabled}
      onPress={() => model.checkIdentity('publish')} style={styles.option}>
      <Text style={styles.optionText}>Vérifier mon identité pour accepter</Text>
    </Pressable> : !model.compatibleActiveVehicles.length ? <Text style={styles.hint}>Aucun véhicule compatible avec cette commande.</Text>
      : model.myOffer?.status === 'pending' ? <Text style={styles.hint}>Votre réponse attend la confirmation du passager.</Text> : null}
    <View style={styles.buttons}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
        style={[styles.button, styles.refuse, disabled && styles.disabled]} onPress={model.handleDeclineTripRequest}>
        <Text style={styles.refuseText}>Refuser</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canAccept, busy }} disabled={!canAccept}
        style={[styles.button, styles.accept, !canAccept && styles.disabled]} onPress={() => { void model.handleDirectAcceptTripRequest(false, true); }}>
        {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.acceptText}>Accepter</Text>}
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 10 }, summary: { padding: 16, borderRadius: 20, backgroundColor: Colors.white, gap: 8 },
  summaryTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  passengerCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 140, gap: 3 }, secondary: { paddingHorizontal: 4, gap: 4 },
  fare: { gap: 2, flexShrink: 1 }, amount: { fontSize: 22, fontWeight: '800', color: Colors.gray[900] },
  priceLabel: { fontSize: 12, color: Colors.gray[600] }, muted: { fontSize: 14, lineHeight: 20, color: Colors.gray[600] },
  schedule: { fontSize: 14, fontWeight: '600', color: Colors.gray[800] },
  passenger: { fontSize: 17, fontWeight: '700', color: Colors.gray[900] },
  option: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 14, color: Colors.gray[600] },
  footer: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 10, gap: 10, backgroundColor: Colors.white, borderTopWidth: 1, borderColor: Colors.gray[200] },
  buttons: { flexDirection: 'row', gap: 12 }, button: { flex: 1, minHeight: 52, padding: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  refuse: { backgroundColor: Colors.gray[100] }, accept: { backgroundColor: '#12813C' },
  refuseText: { color: Colors.gray[800], fontSize: 18, fontWeight: '700' }, acceptText: { color: Colors.white, fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 12, color: Colors.gray[600], textAlign: 'center' }, disabled: { opacity: 0.5 },
});
