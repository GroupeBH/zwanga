import type { Booking } from '@/types';
import type { RideOutboxEntry, RideSnapshot, RideStage } from './rideRecoveryModel';
import { rideEntryMessage } from './rideRecoveryModel';

type RideActor = 'driver' | 'passenger';
const STAGES: RideStage[] = ['pickup', 'dropoff'];

export function rideActionLabel(actor: RideActor, stage: RideStage) {
  if (actor === 'passenger') return stage === 'pickup' ? 'Je suis à bord' : 'Je suis arrivé à destination';
  return stage === 'pickup' ? 'Le passager est monté' : 'Le passager est arrivé';
}

export function rideSavedActionLabel(actor: RideActor, stage: RideStage) {
  if (actor === 'driver') return 'Réponse enregistrée';
  return stage === 'pickup' ? 'Embarquement déclaré' : 'Arrivée à destination déclarée';
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
      unavailable: Boolean(item.status !== 'accepted' || item.droppedOff || item.droppedOffAt || entry || serverStage?.[actor] || status === 'confirmed' || status === 'disputed' || (stage === 'dropoff' && !canArrive)),
      own: serverStage?.[actor],
      other: serverStage?.[actor === 'driver' ? 'passenger' : 'driver'],
      label: rideActionLabel(actor, stage),
    };
  });
}

/** Never describe the other person's receipt as the current user's confirmation. */
export function rideStageMessage(stage: ReturnType<typeof rideBookingStages>[number], actor: RideActor) {
  const { entry, status, own, other } = stage;
  if (status === 'awaiting_other' && !entry && !own && other === 'confirm') {
    return actor === 'driver' ? 'Le passager a confirmé. À vous de confirmer.'
      : 'Le conducteur a confirmé. Votre validation est attendue.';
  }
  if (!['confirmed', 'disputed', 'ready'].includes(status ?? '') &&
      (entry?.state === 'received' || (!entry && own === 'confirm'))) {
    if (stage.stage === 'dropoff' && actor === 'passenger') {
      return 'Votre arrivée est reçue. Le serveur prépare le paiement.';
    }
    return actor === 'driver' ? 'Votre confirmation est reçue. Le passager doit confirmer.'
      : 'Votre validation est reçue. En attente du conducteur.';
  }
  if (actor === 'driver' && entry?.state !== 'blocked') {
    if (status === 'confirmed' || entry?.state === 'confirmed') return stage.stage === 'pickup' ? 'Montée confirmée.' : 'Arrivée confirmée.';
    if (status === 'disputed' || entry?.state === 'disputed') return 'Vous et le passager avez répondu différemment. Contactez l’aide.';
    if (entry?.state === 'sending') return 'Gardé sur ce téléphone. Envoi en cours…';
    if (entry?.state === 'queued') return entry.message ?? 'Gardé sur ce téléphone. Envoi au retour d’Internet.';
    if (status === 'ready') return 'Vérification en cours…';
    if (entry?.state === 'received') return 'Votre confirmation est reçue. Le passager doit confirmer.';
    if (status === 'awaiting_other') return 'En attente de la réponse du passager.';
    return 'Le suivi est automatique. Confirmez seulement si le passager est monté ou arrivé.';
  }
  return rideEntryMessage(entry, status);
}

export function rideRecoveryTrigger(actor: RideActor, availableStages: RideStage[]) {
  const pickup = availableStages.includes('pickup');
  const dropoff = availableStages.includes('dropoff');
  if (pickup && dropoff) return {
    label: actor === 'driver' ? 'Choisir un passager' : 'Embarquement ou arrivée à destination',
    accessibilityLabel: actor === 'driver' ? 'Choisir le passager à confirmer' : 'Confirmer un embarquement ou une arrivée à destination',
    icon: 'people-outline' as const,
  };
  if (pickup || dropoff) {
    const label = rideActionLabel(actor, pickup ? 'pickup' : 'dropoff');
    return { label, accessibilityLabel: label, icon: pickup ? 'car-outline' as const : 'flag-outline' as const };
  }
  return { label: actor === 'driver' ? 'Voir mes passagers' : 'Voir les confirmations',
    accessibilityLabel: actor === 'driver' ? 'Voir les réponses de mes passagers' : 'Voir les confirmations du trajet', icon: 'list-outline' as const };
}
