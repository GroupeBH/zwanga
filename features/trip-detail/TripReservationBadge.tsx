import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { Trip } from '@/types';
import { rideStyles as s } from '@/features/ride-design/rideDesign';

export function reservationBadgeLabel(trip?: Pick<Trip, 'status'>, expired = false) {
  if (trip?.status === 'cancelled') return 'Trajet annulé';
  if (trip?.status === 'completed') return 'Trajet terminé';
  if (trip?.status === 'ongoing') return 'Trajet en cours';
  if (expired) return 'Trajet expiré';
  return 'Réservation confirmée';
}

/** Only mounted for an accepted booking; the trip lifecycle still takes precedence. */
export function TripReservationBadge({ trip, expired }: { trip?: Trip; expired?: boolean }) {
  const active = trip?.status === 'ongoing' || (trip?.status === 'upcoming' && !expired);
  return <View style={[s.pill, { flexShrink: 1, marginHorizontal: 8 }, !active && { backgroundColor: '#F2F4F7' }]}>
    <Ionicons name={active ? 'checkmark' : 'information-circle-outline'} size={18} color={active ? '#116E3A' : '#5E697B'} />
    <Text style={[s.pillText, !active && { color: '#5E697B' }]}>{reservationBadgeLabel(trip, expired)}</Text>
  </View>;
}
