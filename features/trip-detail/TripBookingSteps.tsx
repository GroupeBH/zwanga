import { TRIP_PAYMENT_MODE_OPTIONS, getTripPaymentModeLabel } from './tripDetailModel';
import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import type { Trip, TripPaymentMode } from '@/types';
import { PassengerSeatNotice } from '@/components/PassengerSeatNotice';
import { FormDisclosure } from '@/components/forms/FormDisclosure';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { useTripPaymentOptionsQuery } from '@/store/api/driverFinanceApi';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getRouteStopLabel } from '@/utils/routeLocationLabels';
import { BookingPriceProposalField } from './BookingPriceProposalField';
import { compactBookingStyles as s } from './compactBookingStyles';

interface TripBookingStepsProps {
  viewportHeight: number;
  bookingStep: 1 | 2 | 3;
  adjustBookingSeats: (delta: number) => void;
  isBooking: boolean;
  bookingSeats: string;
  bookingProposedPrice?: string;
  setBookingProposedPrice?: (value: string) => void;
  handleBookingSeatsChange: (value: string) => void;
  seatLimit: number;
  isIdentityVerified: boolean;
  openPassengerIdentityVerification: (source?: "extra_seats" | "book" | "request") => void;
  estimatedTotal: number;
  bookingPaymentMode: TripPaymentMode;
  setBookingPaymentMode: React.Dispatch<React.SetStateAction<TripPaymentMode>>;
  openBookingLocationPicker: (target: "origin" | "destination") => void;
  passengerOriginDisplay: string;
  passengerOriginManualAddress: string;
  setPassengerOriginManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setShouldAutofillPassengerOrigin: React.Dispatch<React.SetStateAction<boolean>>;
  setPassengerOrigin: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  isValidatingDestination: boolean;
  passengerDestinationDisplay: string;
  passengerDestinationManualAddress: string;
  setPassengerDestinationManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setPassengerDestination: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  trip: Trip | undefined;
}


export function TripBookingSteps(props: TripBookingStepsProps) {
  const { trip, bookingSeats, estimatedTotal, bookingPaymentMode, bookingProposedPrice = '' } = props;
  const active = useScreenIsActive();
  const busy = props.isBooking || props.isValidatingDestination;
  const { currentData: options, isFetching, isError, refetch } = useTripPaymentOptionsQuery(
    { tripId: trip?.id ?? '', numberOfSeats: Math.max(1, Number(bookingSeats) || 1) },
    { skip: !active || !trip?.id || estimatedTotal <= 0, refetchOnMountOrArgChange: true },
  );
  const accepted = trip?.acceptedPaymentModes ?? ['cash', 'electronic', 'points'];
  const paymentUnavailable = Boolean(options && !options.availablePaymentModes.includes(bookingPaymentMode));
  const points = [
    { key: 'origin' as const, label: 'Départ', value: props.passengerOriginDisplay || trip?.departure?.address },
    { key: 'destination' as const, label: 'Arrivée', value: props.passengerDestinationDisplay || trip?.arrival?.address },
  ];
  return <ScrollView style={{ flexShrink: 1, maxHeight: Math.min(560, props.viewportHeight * 0.6) }}
    contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <Text style={s.hint}>Vérifiez les points du trajet avant de réserver.</Text>
    {points.map(point => <TouchableOpacity key={point.key} accessibilityRole="button"
      accessibilityLabel={`Modifier le point de ${point.key === 'origin' ? 'départ' : 'destination'}`}
      style={s.routeRow} disabled={busy} onPress={() => props.openBookingLocationPicker(point.key)}>
      <Ionicons name={point.key === 'origin' ? 'location-outline' : 'flag-outline'} size={22} color={Colors.primary} />
      <View style={s.copy}><Text style={s.hint}>{point.label}</Text>
        <Text style={s.value} numberOfLines={2}>{getRouteStopLabel({ address: point.value }, point.key === 'origin' ? 'Point de départ' : 'Destination').address}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.gray[500]} />
    </TouchableOpacity>)}
    <FormDisclosure title="Saisir une adresse" summary="Si vous ne trouvez pas le lieu sur la carte"
      forceOpen={Boolean(props.passengerOriginManualAddress || props.passengerDestinationManualAddress)}>
      <TextInput accessibilityLabel="Adresse de départ" style={s.input} placeholder="Adresse de départ"
        value={props.passengerOriginManualAddress} editable={!busy} onChangeText={value => {
          props.setPassengerOriginManualAddress(value); props.setShouldAutofillPassengerOrigin(false);
          if (value.trim()) props.setPassengerOrigin(null);
        }} />
      <TextInput accessibilityLabel="Adresse d’arrivée" style={s.input} placeholder="Adresse d’arrivée"
        value={props.passengerDestinationManualAddress} editable={!busy} onChangeText={value => {
          props.setPassengerDestinationManualAddress(value);
          if (value.trim()) props.setPassengerDestination(null);
        }} />
    </FormDisclosure>
    <View style={s.row}>
      <View style={s.copy}><Text style={s.value}>Places</Text>
        <Text style={s.hint}>{props.seatLimit} disponible{props.seatLimit > 1 ? 's' : ''}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Une place en moins" style={s.stepper}
        disabled={busy || Number(bookingSeats) <= 1} onPress={() => props.adjustBookingSeats(-1)}>
        <Ionicons name="remove" size={20} color={Colors.primary} />
      </TouchableOpacity>
      <TextInput accessibilityLabel="Nombre de places" value={bookingSeats} style={s.seats}
        keyboardType="number-pad" editable={!busy} onChangeText={props.handleBookingSeatsChange}
        maxLength={String(Math.max(1, props.seatLimit)).length} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Une place en plus" style={s.stepper}
        disabled={busy || Number(bookingSeats) >= props.seatLimit} onPress={() => props.adjustBookingSeats(1)}>
        <Ionicons name="add" size={20} color={Colors.primary} />
      </TouchableOpacity>
    </View>
    {Number(bookingSeats) >= 3 && <PassengerSeatNotice isIdentityVerified={props.isIdentityVerified}
      capacity={props.seatLimit} onVerify={() => props.openPassengerIdentityVerification()} />}
    <View style={s.row}><Text style={s.value}>{bookingProposedPrice.trim() ? 'Total proposé' : 'Total'}</Text>
      <Text style={s.price}>{estimatedTotal === 0 ? 'Gratuit' : `${estimatedTotal.toLocaleString('fr-FR')} FC`}</Text>
    </View>
    {props.setBookingProposedPrice && !trip?.tripRequestId && <BookingPriceProposalField listedPrice={trip?.price ?? 0}
      seats={Number(bookingSeats)} value={bookingProposedPrice} onChange={props.setBookingProposedPrice} disabled={busy} />}
    {estimatedTotal > 0 && <FormDisclosure title="Paiement" summary={getTripPaymentModeLabel(bookingPaymentMode)}
      forceOpen={isError || paymentUnavailable || !accepted.includes(bookingPaymentMode)}>
      {isFetching && <Text style={s.hint}>Vérification des modes disponibles…</Text>}
      {isError && <TouchableOpacity accessibilityRole="button" disabled={isFetching || busy || !active}
        style={s.routeRow} onPress={() => { void refetch(); }}>
        <Text style={s.error}>Vérification indisponible · Réessayer</Text>
      </TouchableOpacity>}
      {!!options?.cashUnavailableReason && <Text style={s.hint}>{options.cashUnavailableReason}</Text>}
      {TRIP_PAYMENT_MODE_OPTIONS.filter(option => accepted.includes(option.id)).map(option => {
        const selected = option.id === bookingPaymentMode;
        const unavailable = !options || isError || !options.availablePaymentModes.includes(option.id);
        return <TouchableOpacity key={option.id} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy || unavailable }}
          disabled={busy || unavailable} onPress={() => props.setBookingPaymentMode(option.id)}
          style={[s.routeRow, unavailable && s.disabled]}>
          <Ionicons name={option.icon} size={20} color={Colors.primary} />
          <View style={s.copy}><Text style={s.value}>{option.label}</Text>
            {unavailable && <Text style={s.hint}>Indisponible actuellement</Text>}</View>
          <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? Colors.primary : Colors.gray[500]} />
        </TouchableOpacity>;
      })}
    </FormDisclosure>}
    {trip?.requiresPassengerKyc && <Text style={s.hint}>Identité vérifiée requise pour ce trajet.</Text>}
    <Text style={s.hint}>{bookingProposedPrice.trim()
      ? 'Le conducteur doit accepter votre prix. Aucun paiement maintenant.'
      : 'Le conducteur recevra votre réservation. Aucun paiement maintenant.'}</Text>
  </ScrollView>;
}
