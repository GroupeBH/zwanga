import { createElement } from 'react';
import type { Trip } from '@/types';
import { PickupVehicleDetails } from '@/features/navigation/PickupVehicleDetails';
import { passengerPickupInstruction } from './pickupAwareness';

export function pickupPassengerDialog(type: string, distanceMeters: number | undefined, trip?: Trip | null) {
  return {
    message: passengerPickupInstruction(type, distanceMeters),
    content: createElement(PickupVehicleDetails, { trip }),
  };
}
