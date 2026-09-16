import type { useNavigationAssistance } from '@/hooks/navigation/useNavigationAssistance';
import { TripSosModal } from '@/features/trip-detail/TripSosModal';
import React from 'react';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { NavigationContactModal } from './NavigationContactModal';

export function NavigationAssistanceModals({ assistance, role, insets, blocked = false }: {
  assistance: ReturnType<typeof useNavigationAssistance>;
  role: 'driver' | 'passenger';
  insets: EdgeInsets;
  blocked?: boolean;
}) {
  if (blocked || !assistance.panel) return null;
  if (assistance.panel === 'sos') return <TripSosModal sosModalVisible closeSosModal={assistance.close} insets={insets} />;
  return <NavigationContactModal contacts={assistance.contacts} role={role} onClose={assistance.close} />;
}
