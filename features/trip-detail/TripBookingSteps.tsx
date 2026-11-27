import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import type { Trip, TripPaymentMode } from '@/types';
import { PassengerSeatNotice } from '@/components/PassengerSeatNotice';
import { FormDisclosure } from '@/components/forms/FormDisclosure';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getRouteStopLabel } from '@/utils/routeLocationLabels';
import { BookingPriceProposalField } from './BookingPriceProposalField';
import { compactBookingStyles as s } from './compactBookingStyles';
import type { BookingLocationLabels } from './bookingLocationLabels';
import type { TripBookingReferences } from '@/hooks/trip-detail/useTripBookingReferences';
import { RequestReferenceField } from '@/components/trip-request/RequestReferenceField';

interface TripBookingStepsProps {
  bookingReferences?: TripBookingReferences;
  bookingLocationLabels?: BookingLocationLabels;
  header?: React.ReactNode;
  footer?: React.ReactNode;
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
  const { trip, bookingSeats, bookingProposedPrice = '' } = props;
  const busy = props.isBooking || props.isValidatingDestination;
  const points = [
    { key: 'origin' as const, label: 'Départ', value: props.bookingLocationLabels?.origin ?? {
      text: getRouteStopLabel({ address: props.passengerOriginDisplay || trip?.departure?.address }, 'Point de départ').address } },
    { key: 'destination' as const, label: 'Arrivée', value: props.bookingLocationLabels?.destination ?? {
      text: getRouteStopLabel({ address: props.passengerDestinationDisplay || trip?.arrival?.address }, 'Destination').address } },
  ];
  return <ScrollView style={{ flexShrink: 1, maxHeight: Math.min(560, props.viewportHeight * 0.6) }}
    contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    {props.header}
    <Text style={s.hint}>{trip?.tripRequestId
      ? 'Vérifiez les points du trajet avant de réserver.'
      : 'Point de récupération : à 100 m maximum de l’itinéraire.'}</Text>
    <View style={s.routePanel}>{points.map((point, index) => <React.Fragment key={point.key}>
      {index > 0 && <View style={s.routeSeparator} />}
      <TouchableOpacity accessibilityRole="button"
      accessibilityLabel={`Modifier le point de ${point.key === 'origin' ? 'départ' : 'destination'}`}
      style={s.routeRow} disabled={busy} onPress={() => props.openBookingLocationPicker(point.key)}>
      <View style={[s.routeDot, point.key === 'destination' && s.arrivalDot]} />
      <View style={s.copy}><Text style={s.hint}>{point.label}</Text>
        <Text style={s.value} numberOfLines={2}>{point.value.text}</Text>
        {point.value.hint && <Text style={s.hint}>{point.value.hint}</Text>}
      </View>
      <Ionicons name="create-outline" size={21} color="#5E697B" />
    </TouchableOpacity>
    {props.bookingReferences && <RequestReferenceField
      target={point.key === 'origin' ? 'departure' : 'arrival'}
      value={props.bookingReferences[point.key].value}
      onChangeText={props.bookingReferences[point.key].onChangeText}
      required={props.bookingReferences[point.key].required} disabled={busy} keepHintVisible />}
    </React.Fragment>)}</View>
    <FormDisclosure title="Lieu introuvable ? Saisir une adresse"
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
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Une place en moins" style={[s.stepper, (busy || Number(bookingSeats) <= 1) && s.disabled]}
        disabled={busy || Number(bookingSeats) <= 1} onPress={() => props.adjustBookingSeats(-1)}>
        <Ionicons name="remove" size={20} color={Colors.primary} />
      </TouchableOpacity>
      <TextInput accessibilityLabel="Nombre de places" value={bookingSeats} style={s.seats}
        keyboardType="number-pad" editable={!busy} onChangeText={props.handleBookingSeatsChange}
        maxLength={String(Math.max(1, props.seatLimit)).length} />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Une place en plus" style={[s.stepper, s.plus, (busy || Number(bookingSeats) >= props.seatLimit) && s.disabled]}
        disabled={busy || Number(bookingSeats) >= props.seatLimit} onPress={() => props.adjustBookingSeats(1)}>
        <Ionicons name="add" size={20} color={Colors.primary} />
      </TouchableOpacity>
    </View>
    {Number(bookingSeats) >= 3 && <PassengerSeatNotice isIdentityVerified={props.isIdentityVerified}
      capacity={props.seatLimit} onVerify={() => props.openPassengerIdentityVerification()} />}
    {props.setBookingProposedPrice && !trip?.tripRequestId && <BookingPriceProposalField listedPrice={trip?.price ?? 0}
      seats={Number(bookingSeats)} value={bookingProposedPrice} onChange={props.setBookingProposedPrice} disabled={busy} />}
    {trip?.requiresPassengerKyc && <Text style={s.hint}>Identité vérifiée requise pour ce trajet.</Text>}
    {props.footer}
  </ScrollView>;
}
