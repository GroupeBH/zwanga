import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { RouteLocationDetails } from '@/components/trip/RouteLocationDetails';
import { ManageTripBookings } from '@/features/manage-trip/ManageTripBookings';
import { ManageTripInterruptionNotice } from '@/features/manage-trip/ManageTripInterruptionNotice';
import { ManageTripBookingsReadState } from '@/features/manage-trip/ManageTripBookingsReadState';
import type { useTripDetailController } from '@/hooks/trip-detail/useTripDetailController';
import type { useDriverTripWorkspace } from '@/hooks/trip-detail/useDriverTripWorkspace';
import { driverTripStyles as s } from './DriverTripWorkspace.styles';

export function DriverTripDetailContent({ model, workspace: w }: {
  model: ReturnType<typeof useTripDetailController>; workspace: ReturnType<typeof useDriverTripWorkspace>;
}) {
  const { data, presentation: p, config, bookingState } = model;
  const trip = data.trip;
  const pending = data.tripBookings?.filter(booking => booking.status === 'pending').length ?? 0;
  const count = data.tripBookings?.filter(booking => booking.status === 'pending' || booking.status === 'accepted' || booking.status === 'completed').length;
  const [details, setDetails] = useState(false);
  const [passengers, setPassengers] = useState(data.passengersFirst || pending > 0);
  useEffect(() => { if (pending || data.passengersFirst) setPassengers(true); }, [pending, data.passengersFirst]);
  if (!trip) return null;
  return <View style={s.sheet}>
    {!!w.feedback && <View style={s.feedback} accessibilityLiveRegion="polite">
      <Text style={s.feedbackText}>{w.feedback.message}</Text><TouchableOpacity style={s.close}
        accessibilityRole="button" accessibilityLabel="Fermer le message" onPress={w.dismissFeedback}>
        <Ionicons name="close" size={20} color={Colors.gray[800]} /></TouchableOpacity>
    </View>}
    <View style={s.row}>
      <View style={s.status}><View style={[s.dot, { backgroundColor: config.color }]} /><Text style={s.muted}>
        {data.tripExpired && trip.status === 'upcoming' && !trip.canReprogram ? 'À démarrer' : config.label}
      </Text></View>
      <Text style={s.price}>{p.tripPriceLabel}{trip.price !== 0 && <Text style={s.unit}>{trip.tripRequestId ? ' pour le trajet' : ' / place'}</Text>}</Text>
    </View>
    <RouteLocationDetails labels={p.routeLabels} compact showContext={details}
      departureTimeLabel={p.tripDepartureTimeLabel} arrivalTimeLabel={p.tripArrivalTimeLabel} />
    <View style={s.facts}>
      <View style={s.fact}><Ionicons name="people-outline" size={15} color={Colors.gray[600]} /><Text style={s.muted}>{p.tripSeatsLabel}</Text></View>
      <View style={s.fact}><Ionicons name="navigate-outline" size={15} color={Colors.gray[600]} /><Text style={s.muted}>{p.tripRouteDistanceLabel}</Text></View>
    </View>
    <ManageTripInterruptionNotice trip={trip} />
    {trip.canReprogram && <Text style={s.muted}>Choisissez une nouvelle date pour repartir.</Text>}
    <TouchableOpacity style={s.disclosure} accessibilityRole="button" accessibilityLabel="Véhicule, adresses et paiements"
      accessibilityState={{ expanded: details }} onPress={() => setDetails(value => !value)}>
      <Ionicons name={p.tripVehicleIconName} size={19} color={Colors.primaryDark} />
      <Text style={s.title}>{p.tripVehicleLabel}</Text><Text style={s.link}>Détails</Text>
      <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.gray[500]} />
    </TouchableOpacity>
    {details && <View style={s.details}>
      <TouchableOpacity style={s.disclosure} accessibilityRole="button" accessibilityLabel="Voir les détails du véhicule"
        onPress={() => bookingState.setVehicleDetailModalVisible(true)}><Text style={s.muted}>{p.tripVehicleMetaLabel}</Text>
        <Ionicons name="chevron-forward" size={17} color={Colors.gray[500]} /></TouchableOpacity>
      {!!trip.acceptedPaymentModes?.length && Number(trip.price) > 0 && <Text style={s.muted}>
        Paiements : {trip.acceptedPaymentModes.map(mode => ({ cash: 'Cash', points: 'Jetons', electronic: 'Électronique' })[mode]).join(' · ')}
      </Text>}
      {!!trip.requiresPassengerKyc && <Text style={s.muted}>Identité vérifiée requise pour réserver</Text>}
      {!!trip.description && <Text style={s.muted}>{trip.description}</Text>}
    </View>}
    <TouchableOpacity style={s.disclosure} accessibilityRole="button" accessibilityLabel="Voir les réservations des passagers"
      accessibilityState={{ expanded: passengers }} onPress={() => setPassengers(value => !value)}>
      <Ionicons name="people-outline" size={20} color={Colors.gray[700]} />
      <Text style={s.title}>Passagers{count === undefined ? '' : ` · ${count}`}</Text>
      {pending > 0 && <Text style={s.pending}>{pending} à confirmer</Text>}
      <Ionicons name={passengers ? 'chevron-up' : 'chevron-down'} size={17} color={Colors.gray[500]} />
    </TouchableOpacity>
    {passengers ? <ManageTripBookings compact actionsDisabled={!w.ready || w.busy} state={w.state} tracking={{ visibleBookings: data.tripBookings }}
      actions={w.actions} bookingsActions={w.bookingsActions} /> : <>
      <ManageTripBookingsReadState loading={w.state.bookingsLoading || w.state.bookingsFetching}
        failed={w.state.bookingsError} offline={w.state.bookingsOffline} partial={false}
        canRetry={w.state.canRetryBookings} onRetry={w.state.refetchBookings} />
      {count === 0 && !w.state.bookingsError && !w.state.bookingsOffline && !w.state.bookingsFetching &&
        <Text style={s.muted}>Aucune réservation pour le moment.</Text>}
    </>}
  </View>;
}
