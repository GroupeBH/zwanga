import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TripSummaryProps } from './TripSummary';
import { bookingPassengerTotal, bookingProposalPrice } from './bookingPriceProposal';
import { RideRouteTimeline } from '@/features/ride-design/RideRouteTimeline';
import { rideArrivalTime, rideClock, rideColors as c, rideDay, rideInitials, rideStyles as r } from '@/features/ride-design/rideDesign';
import { formatDateTime } from '@/utils/dateHelpers';
import { passengerRideStage } from '@/features/passenger-navigation/passengerRideProgress';

export function PassengerTripSummary(props: TripSummaryProps) {
  const { trip, booking, config, routeLabels } = props;
  const large = useWindowDimensions().fontScale > 1.3;
  if (!trip) return null;
  const hasBooking = Boolean(booking);
  // The passenger may have arrived while the trip remains open for cash collection or other passengers.
  const hasArrived = Boolean(booking && (booking.status === 'completed' || passengerRideStage(booking) === 'dropoff'));
  const actualArrival = booking?.droppedOffAt && Number.isFinite(Date.parse(booking.droppedOffAt))
    ? rideArrivalTime(trip.departureTime, booking.droppedOffAt) : undefined;
  const name = trip.driverName || 'Votre conducteur';
  const rating = Number.isFinite(props.driverReviewAverage) && props.driverReviewAverage > 0
    ? props.driverReviewAverage.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : 'Nouveau';
  const duration = trip.estimatedDurationSeconds;
  const durationLabel = typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? `${Math.ceil(duration / 60)} min` : null;
  const total = booking ? bookingPassengerTotal(booking, trip.price) : null;
  const proposed = booking?.status === 'pending' && bookingProposalPrice(booking) !== null;
  const facts = <View style={s.facts}>
    <View style={s.fact}><Ionicons name="people-outline" size={15} color={c.muted} /><Text style={s.factText}>{props.tripSeatsLabel}</Text></View>
    {props.tripRouteDistanceLabel !== 'Trajet' && <View style={s.fact}><Ionicons name="navigate-outline" size={15} color={c.muted} /><Text style={s.factText}>{props.tripRouteDistanceLabel}</Text></View>}
    {durationLabel && <View style={s.fact}><Ionicons name="time-outline" size={15} color={c.muted} /><Text style={s.factText}>{durationLabel}</Text></View>}
  </View>;
  return <View style={s.summary}>
    {!hasBooking && <>
      <View style={s.top}><View style={[s.status, { backgroundColor: config.bgColor }]}>
        <View style={[s.dot, { backgroundColor: config.color }]} /><Text style={s.statusText}>{config.label}</Text>
      </View><View style={[s.priceBadge, trip.price === 0 && { backgroundColor: c.greenSoft }]}>
        <Text style={[s.priceText, trip.price === 0 && { color: c.greenInk }]}>{props.tripPriceLabel}{trip.price !== 0 && !trip.tripRequestId ? ' / place' : ''}</Text>
      </View></View>
      <Text style={s.day}>{rideDay(trip.departureTime)}</Text>
      {facts}
    </>}
    {hasBooking && <View style={[r.row, large && r.stack]}>
      <View style={r.copy}><Text style={r.muted}>Départ · {rideDay(trip.departureTime).split(' · ')[0]}</Text><Text style={r.time}>{rideClock(trip.departureTime)}</Text></View>
      <View style={r.copy}><Text style={[r.muted, !large && r.right]}>{proposed ? 'Total proposé' : 'Total'} · {booking!.numberOfSeats} place{booking!.numberOfSeats > 1 ? 's' : ''}</Text>
        <Text style={[r.amount, !large && r.right]}>{total === 0 ? 'Gratuit' : `${total?.toLocaleString('fr-FR')} FC`}</Text></View>
    </View>}
    {hasBooking && props.paymentNotice}
    <RideRouteTimeline labels={routeLabels} outlined={hasBooking} departureTime={hasBooking ? undefined : rideClock(trip.departureTime)}
      arrivalConfirmed={hasArrived}
      arrivalTime={hasArrived ? actualArrival : props.tripArrivalClockLabel || rideArrivalTime(trip.departureTime, trip.arrivalTime)}>{hasBooking ? facts : null}</RideRouteTimeline>
    {trip.status === 'ongoing' && !hasArrived && <View style={{ gap: 4 }}><Text style={r.muted}>Progression · {props.progress}%</Text>
      <Text style={r.muted}>Arrivée estimée : {props.estimatedArrivalTime ? formatDateTime(props.estimatedArrivalTime.toISOString()) : props.tripArrivalTimeLabel}</Text></View>}
    <View style={s.driverCard}>
      <View style={r.row}>
        <TouchableOpacity style={[r.row, r.copy]} accessibilityRole="button" accessibilityLabel={`Voir le profil de ${name}`}
          onPress={() => { if (trip.driverId) props.router.push({ pathname: '/driver/[id]', params: { id: trip.driverId, sourceTripId: trip.id } }); }}>
          {trip.driverAvatar ? <Image source={{ uri: trip.driverAvatar }} style={r.avatar} resizeMethod="resize" fadeDuration={0} />
            : <View style={r.avatar}><Text style={r.initials}>{rideInitials(name)}</Text></View>}
          <View style={r.copy}><Text style={s.label}>CONDUCTEUR</Text><Text style={s.driverName}>{name}</Text>
            <Text style={s.vehicleMeta}>{rating !== 'Nouveau' ? '★ ' : ''}{rating}{!hasBooking ? ` · ${props.tripVehicleLabel}` : ''}</Text></View>
        </TouchableOpacity>
        <TouchableOpacity style={[r.circle, s.message]} accessibilityRole="button" accessibilityLabel="Envoyer un message au conducteur"
          accessibilityState={{ busy: props.isOpeningConversation, disabled: props.isOpeningConversation }} disabled={props.isOpeningConversation}
          onPress={props.handleContactDriver}>
          {props.isOpeningConversation ? <ActivityIndicator size="small" color={c.orange} /> : <Ionicons name="chatbubble-outline" size={21} color={c.orange} />}
        </TouchableOpacity>
        {!large && <TouchableOpacity style={r.circle} accessibilityRole="button" accessibilityLabel="Choisir comment contacter le conducteur"
          onPress={() => props.setContactModalVisible(true)}><Ionicons name="call-outline" size={21} color={c.text} /></TouchableOpacity>}
      </View>
      <TouchableOpacity style={[s.vehicle, large && r.stack]} onPress={() => props.setVehicleDetailModalVisible(true)} accessibilityRole="button" accessibilityLabel="Voir les détails du véhicule">
        <Text style={[s.vehicleMeta, r.copy]}>{props.tripVehicleLabel}{trip.vehicle?.color ? ` · ${trip.vehicle.color}` : ''}</Text>
        {trip.vehicle?.licensePlate ? <Text style={s.plate}>{trip.vehicle.licensePlate}</Text> : <Ionicons name="chevron-forward" size={16} color={c.muted} />}
      </TouchableOpacity>
      {large && <TouchableOpacity style={s.contactLink} accessibilityRole="button" accessibilityLabel="Choisir comment contacter le conducteur"
        onPress={() => props.setContactModalVisible(true)}><Text style={s.contactText}>Contacter le conducteur</Text></TouchableOpacity>}
    </View>
    {trip.requiresPassengerKyc && <View style={s.notice}><Ionicons name="shield-checkmark-outline" size={18} color={c.greenInk} /><Text style={s.noticeText}>Identité vérifiée requise pour réserver</Text></View>}
  </View>;
}

const s = StyleSheet.create({
  summary: { paddingHorizontal: 16, paddingBottom: 12, gap: 14 },
  top: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: c.ink, fontSize: 12, fontWeight: '600' },
  priceBadge: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: c.peach },
  priceText: { color: c.orange, fontWeight: '700', fontSize: 13 },
  day: { color: c.ink, fontSize: 19, lineHeight: 26, fontWeight: '700' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { fontSize: 13, lineHeight: 20, color: c.ink, fontWeight: '500' },
  driverCard: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 12, gap: 10 },
  label: { color: c.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  driverName: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  vehicleMeta: { color: c.muted, fontSize: 13, lineHeight: 19 },
  message: { backgroundColor: c.peach },
  vehicle: { borderTopWidth: 1, borderColor: c.line, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  plate: { paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1.5, borderColor: c.text, borderRadius: 6, color: c.text, fontSize: 15, fontWeight: '800' },
  contactLink: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  contactText: { color: c.orange, fontSize: 13, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: c.greenSoft },
  noticeText: { flex: 1, color: c.ink, fontSize: 13, lineHeight: 19 },
});
