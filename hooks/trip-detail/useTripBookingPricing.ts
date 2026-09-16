import { ELECTRONIC_PAYMENTS_ENABLED } from '@/constants/paymentFeatures';
import type { Booking } from '@/types';
import React, { useMemo } from 'react';
import type { Trip } from '@/types';

interface Params {
  setBookingSeats: React.Dispatch<React.SetStateAction<string>>;
  seatLimit: number;
  setBookingModalError: React.Dispatch<React.SetStateAction<string>>;
  bookingSeats: string;
  trip: Trip | undefined;
  activeBooking: Booking | null;
}

export function useTripBookingPricing({
  setBookingSeats,
  seatLimit,
  setBookingModalError,
  bookingSeats,
  trip,
  activeBooking,
}: Params) {
  const adjustBookingSeats = (delta: number) => {
    setBookingSeats((prev) => {
      const current = parseInt(prev, 10);
      const fallback = Number.isNaN(current) ? 1 : current;
      // Limiter au nombre de places disponibles
      const next = Math.min(Math.max(fallback + delta, 1), seatLimit);
      return String(next);
    });
  };

  const handleBookingSeatsChange = (value: string) => {
    // Permettre seulement les chiffres
    const numericValue = value.replace(/[^0-9]/g, '');

    if (numericValue === '') {
      setBookingSeats('');
      setBookingModalError('');
      return;
    }

    const seatsNum = parseInt(numericValue, 10);

    // Vérifier si la valeur dépasse les places disponibles
    if (seatsNum > seatLimit) {
      setBookingModalError(
        `Il ne reste que ${seatLimit} place${seatLimit > 1 ? 's' : ''} disponible${seatLimit > 1 ? 's' : ''}.`,
      );
      setBookingSeats(String(seatLimit));
      return;
    }

    // Valeur valide
    setBookingSeats(numericValue);
    setBookingModalError('');
  };


  const estimatedTotal = useMemo(() => {
    const seatsValue = parseInt(bookingSeats, 10);
    if (Number.isNaN(seatsValue) || seatsValue <= 0 || !trip) {
      return 0;
    }
    return trip.price === 0 ? 0 : seatsValue * trip.price;
  }, [bookingSeats, trip?.price]);
  const activeBookingPaymentAmount = useMemo(() => {
    if (!activeBooking) return 0;
    const storedAmount = Number(activeBooking.paymentAmount ?? 0);
    if (Number.isFinite(storedAmount) && storedAmount > 0) return storedAmount;
    const tripPrice = Number(trip?.price ?? 0);
    return tripPrice > 0 ? activeBooking.numberOfSeats * tripPrice : 0;
  }, [activeBooking, trip?.price]);
  const canPayActiveBooking = Boolean(
      activeBooking &&
      ELECTRONIC_PAYMENTS_ENABLED &&
      (activeBooking.status === 'completed' ||
        activeBooking.droppedOff ||
        activeBooking.droppedOffConfirmedByPassenger) &&
      activeBooking.paymentMode === 'electronic' &&
      activeBookingPaymentAmount > 0 &&
      activeBooking.paymentStatus !== 'succeeded' &&
      activeBooking.paymentStatus !== 'not_required',
  );

  return {
    estimatedTotal,
    canPayActiveBooking,
    activeBookingPaymentAmount,
    adjustBookingSeats,
    handleBookingSeatsChange,
  };
}
