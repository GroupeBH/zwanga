import { usablePhone, type NavigationContact } from '@/features/navigation/navigationContacts';
import type { TripRequest } from '@/types';

export function getAcceptedRequestContact(request: TripRequest | undefined, userId: string | undefined): NavigationContact | null {
  if (!userId || request?.status !== 'driver_selected' || request.selectedDriverId !== userId ||
    !request.passengerId || request.passengerId === userId) return null;
  return { id: request.passengerId, name: request.passengerName || 'Votre passager',
    phone: usablePhone(request.passengerPhone), detail: 'Convenez du point de rendez-vous.' };
}
