import type { Booking } from '@/types';
import type { RideOutboxEntry, RideSnapshot, RideStage } from './rideRecoveryModel';

type RideActor = 'driver' | 'passenger';
const STAGES: RideStage[] = ['pickup', 'dropoff'];

export function rideActionLabel(actor: RideActor, stage: RideStage) {
  if (actor === 'passenger') return stage === 'pickup' ? 'Je suis à bord' : 'Je suis arrivé';
  return stage === 'pickup' ? 'Confirmer l’embarquement' : 'Confirmer la dépose';
}

/** Share the existing sheet's availability rules with its entry-point label. */
export function rideBookingStages(item: Booking, snapshot: RideSnapshot | undefined, entries: RideOutboxEntry[], actor: RideActor) {
  const localPickup = entries.some(value => value.bookingId === item.id && value.stage === 'pickup' && value.decision === 'confirm' && !['blocked', 'disputed'].includes(value.state));
  const canArrive = Boolean(item.pickedUp || snapshot?.pickup.status === 'confirmed' || localPickup);
  return STAGES.map(stage => {
    const entry = entries.find(value => value.bookingId === item.id && value.stage === stage);
    const serverStage = snapshot?.[stage];
    const status = (stage === 'pickup' ? item.pickedUp : item.droppedOff) ? 'confirmed' as const : serverStage?.status;
    return {
      stage, entry, status, canArrive,
      unavailable: Boolean(entry || serverStage?.[actor] || status === 'confirmed' || status === 'disputed' || (stage === 'dropoff' && !canArrive)),
      other: serverStage?.[actor === 'driver' ? 'passenger' : 'driver'],
      label: rideActionLabel(actor, stage),
    };
  });
}

export function rideRecoveryTrigger(actor: RideActor, availableStages: RideStage[]) {
  const pickup = availableStages.includes('pickup');
  const dropoff = availableStages.includes('dropoff');
  if (pickup && dropoff) return {
    label: 'Embarquement ou dépose',
    accessibilityLabel: 'Confirmer un embarquement ou une dépose',
    icon: 'people-outline' as const,
  };
  if (pickup || dropoff) {
    const label = rideActionLabel(actor, pickup ? 'pickup' : 'dropoff');
    return { label, accessibilityLabel: label, icon: pickup ? 'car-outline' as const : 'flag-outline' as const };
  }
  return { label: 'Voir les confirmations', accessibilityLabel: 'Voir les confirmations du trajet', icon: 'list-outline' as const };
}
