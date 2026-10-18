import { NavigationContactModal } from '@/features/navigation/NavigationContactModal';
import React from 'react';
import type { Trip } from '@/types';

interface TripContactModalProps {
  contactModalVisible: boolean;
  setContactModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  trip: Trip | undefined;
  driverPhone: string | null;
  bookingId?: string;
}

export function TripContactModal({
  contactModalVisible,
  setContactModalVisible,
  trip,
  driverPhone,
  bookingId,
}: TripContactModalProps) {
  if (!contactModalVisible || !trip?.driverId) return null;
  return <NavigationContactModal role="passenger" allowPhoneCall={false}
    onClose={() => setContactModalVisible(false)}
    contacts={[{ id: trip.driverId, name: trip.driverName || 'Votre conducteur',
      phone: driverPhone, bookingId, detail: 'Votre conducteur' }]} />;
}
