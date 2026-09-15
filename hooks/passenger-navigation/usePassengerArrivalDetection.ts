import { calculateDistance } from '@/utils/routeHelpers';
import { useEffect } from 'react';
import type { Booking } from '@/types';
import type { MapCoordinate } from '@/utils/tripCoordinates';

interface Params {
  passengerLocation: { latitude: number; longitude: number; } | null;
  dropoffCoordinate: MapCoordinate | null;
  booking: Booking | undefined;
  isTripOngoing: boolean;
  presentArrivalModal: () => void;
  presentNoShowNotice: () => void;
  presentBoardingUncertainNotice: () => void;
}

export function usePassengerArrivalDetection({
  passengerLocation,
  dropoffCoordinate,
  booking,
  isTripOngoing,
  presentArrivalModal,
  presentNoShowNotice,
  presentBoardingUncertainNotice,
}: Params) {
  useEffect(() => {
    if (
      !passengerLocation ||
      !dropoffCoordinate ||
      !booking?.pickedUp ||
      booking.droppedOff ||
      !isTripOngoing
    ) {
      return;
    }

    if (calculateDistance(passengerLocation, dropoffCoordinate) <= 0.06) {
      presentArrivalModal();
    }
  }, [
    booking?.droppedOff,
    booking?.pickedUp,
    dropoffCoordinate,
    isTripOngoing,
    passengerLocation,
    presentArrivalModal,
  ]);

  useEffect(() => {
    if (booking?.droppedOffConfirmedByPassenger || booking?.droppedOff) {
      presentArrivalModal();
    }
  }, [booking?.droppedOff, booking?.droppedOffConfirmedByPassenger, presentArrivalModal]);

  useEffect(() => {
    if (booking?.status === 'no_show') {
      presentNoShowNotice();
    }
    if (booking?.status === 'boarding_uncertain') {
      presentBoardingUncertainNotice();
    }
  }, [booking?.status, presentBoardingUncertainNotice, presentNoShowNotice]);

  return {

  };
}
