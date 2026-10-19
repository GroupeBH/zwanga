import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import type { buildRequestDetailPresentation } from './requestPresentation';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';
import { RouteLocationDetails } from '@/components/trip/RouteLocationDetails';
import { NavigationContactModal } from '@/features/navigation/NavigationContactModal';
import { getAcceptedRequestContact } from './acceptedRequestContact';
import { CollapsibleRouteMap } from './CollapsibleRouteMap';
import { TRIP_REQUEST_VEHICLE_LABELS, formatCdfPrice } from './requestDetailModel';
import { formatRequestDay, formatRequestTime } from './RequestPassengerTicket';
import { requestSummaryStyles as s } from './requestSummaryStyles';

type Model = ReturnType<typeof useRequestDetailController>;
export function RequestDriverCourse({ model, presentation }: { model: Model; presentation: ReturnType<typeof buildRequestDetailPresentation> }) {
  const request = model.tripRequest!, labels = useRouteLocationLabels(request);
  const [contactOpen, setContactOpen] = useState(false);
  const contact = getAcceptedRequestContact(request, model.userId);
  const time = model.assignedTrip?.departureTime || request.departureDateMin;
  const live = model.assignedTrip?.status === 'ongoing';
  const closed = model.assignedTrip && !['upcoming', 'ongoing'].includes(model.assignedTrip.status);
  const name = request.passengerName || 'Votre passager';
  return <>
    <View style={s.card}>
      <Text style={local.confirmed}><Ionicons name="checkmark" size={16} color="#12813C" /> {closed ? 'COURSE TERMINÉE OU ANNULÉE' : live ? 'COURSE EN COURS' : 'COURSE CONFIRMÉE'}</Text>
      <Text style={s.muted}>Prise en charge · {formatRequestDay(time)}</Text>
      <Text style={local.time}>{formatRequestTime(time)}</Text>
      <View style={local.person}>
        <View style={local.avatar}><Text style={local.initials}>{name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('fr-FR')}</Text></View>
        <View style={s.side}><Text style={s.name}>{name}</Text><Text style={local.meta}>Passager · {request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}</Text></View>
        {contact && !closed && <Pressable accessibilityRole="button" accessibilityLabel="Contacter le passager" onPress={() => setContactOpen(true)} style={local.contact}>
          <Ionicons name="call-outline" size={21} color="#111827" />
        </Pressable>}
      </View>
    </View>
    <View style={s.card}>
      <CollapsibleRouteMap variant="light" initiallyExpanded mapData={presentation.requestRouteMapData}
        routeCoordinates={presentation.displayedRouteCoordinates} departureName={labels.departure.address} arrivalName={labels.arrival.address} />
      <RouteLocationDetails labels={labels} />
    </View>
    <View style={s.card}>
      <View style={s.row}><Text style={s.muted}>Véhicule demandé</Text><Text style={s.name}>{TRIP_REQUEST_VEHICLE_LABELS[model.requestedVehicleType]}</Text></View>
      <View style={local.rule} />
      <View style={s.row}><Text style={s.muted}>Passagers</Text><Text style={s.name}>{request.numberOfSeats} place{request.numberOfSeats > 1 ? 's' : ''}</Text></View>
      <View style={local.rule} />
      <View style={s.row}><Text style={s.muted}>Prix par place</Text><Text style={s.name}>{presentation.ownerDisplayedBudget != null ? formatCdfPrice(presentation.ownerDisplayedBudget) : 'À convenir'}</Text></View>
    </View>
    {contactOpen && contact && !closed && <NavigationContactModal role="driver" contacts={[contact]} onClose={() => setContactOpen(false)} />}
  </>;
}

export function RequestCourseActions({ model }: { model: Model }) {
  const busy = model.isStartingTrip || model.isStartingTripFromRequest;
  const canGo = model.assignedTrip && ['upcoming', 'ongoing'].includes(model.assignedTrip.status);
  return <View style={[s.footer, s.footerWhite]}>
    {(canGo || model.canStartAssignedTrip) && <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy}
      style={[s.primary, { flex: undefined }, busy && s.disabled]} onPress={model.canStartAssignedTrip ? model.handleStartTripFromRequest : model.handleGoPickup}>
      {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="navigate-outline" size={20} color="#FFFFFF" />}
      <Text style={s.primaryText}>{model.assignedTrip?.status === 'ongoing' ? 'Reprendre la course' : 'Aller chercher le passager'}</Text>
    </Pressable>}
    {model.tripRequest?.tripId && <Pressable accessibilityRole="button" disabled={busy} style={s.secondary} onPress={() => model.handleViewTrip(model.tripRequest!.tripId!)}>
      <Text style={s.secondaryText}>{canGo ? 'Gérer ou annuler la course' : 'Voir le trajet'}</Text>
    </Pressable>}
  </View>;
}
const local = StyleSheet.create({
  confirmed: { color: '#12813C', fontSize: 12, fontWeight: '800' }, time: { color: '#111827', fontSize: 42, fontWeight: '800' },
  person: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: '#F0F2F5' },
  avatar: { width: 46, height: 46, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE5D5' },
  initials: { color: '#A63C11', fontSize: 16, fontWeight: '700' }, meta: { color: '#536071', fontSize: 13 },
  contact: { width: 44, height: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F5F8' },
  rule: { height: 1, backgroundColor: '#F0F2F5' },
});
