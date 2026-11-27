import { requestVehicleLabel } from '@/features/trip-request/vehicleSelection';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import type { buildRequestDetailPresentation } from './requestPresentation';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { RideRouteTimeline } from '@/features/ride-design/RideRouteTimeline';
import { rideColors as c, rideInitials, rideStyles as r } from '@/features/ride-design/rideDesign';
import { NavigationContactModal } from '@/features/navigation/NavigationContactModal';
import { getAcceptedRequestContact } from './acceptedRequestContact';
import { CollapsibleRouteMap } from './CollapsibleRouteMap';
import { formatCdfPrice } from './requestDetailModel';
import { formatRequestDay, formatRequestTime } from './requestDateLabels';
import { requestSummaryStyles as s } from './requestSummaryStyles';
import { WithdrawRequestDriverButton } from './WithdrawRequestDriverButton';
import { RequestPickupSummaryCard } from './RequestPickupSummaryCard';

type Model = ReturnType<typeof useRequestDetailController>;
export function RequestDriverCourse({ model, presentation }: { model: Model; presentation: ReturnType<typeof buildRequestDetailPresentation> }) {
  const request = model.tripRequest!, labels = useRouteLocationLabels(request);
  const [contactOpen, setContactOpen] = useState(false);
  const contact = getAcceptedRequestContact(request, model.userId);
  const time = model.assignedTrip?.departureTime || request.departureDateMin;
  const live = model.assignedTrip?.status === 'ongoing';
  const closed = model.assignedTrip && !['upcoming', 'ongoing'].includes(model.assignedTrip.status);
  const name = request.passengerName || 'Votre passager';
  const { height, fontScale } = useWindowDimensions();
  return <>
    <View>
      <CollapsibleRouteMap variant="light" displayMode="overview" showRecenter overviewHeight={Math.min(330, Math.max(240, height * 0.36))}
        mapData={presentation.requestRouteMapData} routeCoordinates={presentation.displayedRouteCoordinates}
        departureName={labels.departure.address} arrivalName={labels.arrival.address} />
      <View style={local.mapHeader} pointerEvents="box-none">
        <Pressable onPress={model.goHome} style={[r.circle, local.white]} accessibilityRole="button" accessibilityLabel="Retour à l’accueil">
          <Ionicons name="arrow-back" size={23} color={c.text} />
        </Pressable>
        <View style={[r.pill, local.status, closed && { backgroundColor: c.pale }]}><Ionicons name={closed ? 'information-circle-outline' : live ? 'navigate-outline' : 'checkmark'} size={18} color={closed ? c.muted : c.greenInk} />
          <Text style={[r.pillText, closed && { color: c.muted }]}>{closed ? model.assignedTrip?.status === 'cancelled' ? 'Course annulée' : 'Course terminée' : live ? 'Course en cours' : 'Course confirmée'}</Text></View>
      </View>
    </View>
    <View style={[r.sheet, local.sheet]}>
      <View style={r.handle} />
      <View style={[r.row, fontScale > 1.3 && r.stack]}>
        <View style={r.copy}><Text style={r.muted}>Prise en charge · {formatRequestDay(time)}</Text><Text style={r.time}>{formatRequestTime(time)}</Text></View>
        <View style={r.copy}><Text style={[r.muted, fontScale <= 1.3 && r.right]}>Prix du trajet</Text>
          <Text style={[r.amount, fontScale <= 1.3 && r.right]}>{presentation.ownerDisplayedBudget != null ? formatCdfPrice(presentation.ownerDisplayedBudget) : 'À convenir'}</Text></View>
      </View>
      <View style={r.row}>
        <View style={r.avatar}><Text style={r.initials}>{rideInitials(name)}</Text></View>
        <View style={r.copy}><Text style={r.name}>{name}</Text><Text style={r.muted}>Passager · {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''} · {requestVehicleLabel(request)}</Text></View>
        {contact && !closed && <Pressable accessibilityRole="button" accessibilityLabel="Contacter le passager par message ou téléphone" onPress={() => setContactOpen(true)} style={r.circle}>
          <Ionicons name="call-outline" size={22} color={c.text} />
        </Pressable>}
      </View>
      <RideRouteTimeline labels={labels} outlined />
      {!closed && <RequestPickupSummaryCard requestId={request.id} active={model.isScreenActive} compact />}
      {request.tripId && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => model.handleViewTrip(request.tripId!)}>
        <Text style={s.secondaryText}>Voir les détails du trajet</Text>
      </Pressable>}
    </View>
    {contactOpen && contact && !closed && <NavigationContactModal role="driver" contacts={[contact]} onClose={() => setContactOpen(false)} />}
  </>;
}

export function RequestCourseActions({ model }: { model: Model }) {
  const [withdrawing, setWithdrawing] = useState(false);
  const busy = model.isStartingTrip || model.isStartingTripFromRequest || withdrawing;
  const canGo = model.assignedTrip && ['upcoming', 'ongoing'].includes(model.assignedTrip.status);
  return <View style={[s.footer, s.footerWhite]}>
    {(canGo || model.canStartAssignedTrip) && <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy}
      style={[s.primary, { flex: undefined }, busy && s.disabled]} onPress={model.canStartAssignedTrip ? model.handleStartTripFromRequest : model.handleGoPickup}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />}
      <Text style={s.primaryText}>{model.assignedTrip?.status === 'ongoing' ? 'Reprendre la course' : 'Aller chercher le passager'}</Text>
    </Pressable>}
    <WithdrawRequestDriverButton request={model.tripRequest} trip={model.assignedTrip}
      appearance="link"
      disabled={!model.isScreenActive || model.isStartingTrip || model.isStartingTripFromRequest}
      onWithdrawn={model.goHome} onPendingChange={setWithdrawing} />
  </View>;
}
const local = StyleSheet.create({
  mapHeader: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { flexShrink: 1 }, white: { backgroundColor: '#FFFFFF' },
  sheet: { marginTop: -20 },
});
