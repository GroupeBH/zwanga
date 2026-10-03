import type { RideOutboxEntry, RideSnapshot, RideStage } from './rideRecoveryModel';
import { RideOutboxError } from './rideOutboxEngine';

export interface RideActionTarget {
  tripId: string;
  bookingId: string;
  stage: RideStage;
  actor: 'driver' | 'passenger';
  passengerName?: string;
  numberOfSeats?: number;
}
export type RideActionReceipt = Pick<RideOutboxEntry, 'eventId' | 'state' | 'decision' | 'message'>;
export interface RideActionResult extends RideActionTarget {
  id: string;
  userId: string;
  receipt?: RideActionReceipt;
  error?: string;
}

export function rideSaveError(error: unknown) {
  return error instanceof RideOutboxError ? error.message
    : 'Impossible d’enregistrer votre confirmation sur ce téléphone. Revenez au trajet pour réessayer.';
}

/** A saved receipt is a successful local action, never proof of completed boarding/dropoff. */
export function rideActionResultContent(result: RideActionResult, entry?: RideOutboxEntry, snapshot?: RideSnapshot) {
  let receipt = entry && result.receipt && entry.eventId === result.receipt.eventId && entry.actorUserId === result.userId &&
    entry.bookingId === result.bookingId && entry.tripId === result.tripId && entry.stage === result.stage ? entry : result.receipt;
  // Reuse already-cached server reads; never add another poll or infer completion from a tap.
  if (receipt && snapshot?.bookingId === result.bookingId && snapshot.tripId === result.tripId && snapshot.actor === result.actor) {
    const stage = snapshot[result.stage];
    if (stage.status === 'confirmed' || (stage.status === 'disputed' && receipt.state !== 'confirmed')) receipt = { ...receipt, state: stage.status };
    else if (stage[result.actor] === 'confirm' && ['queued', 'sending'].includes(receipt.state)) receipt = { ...receipt, state: 'received' };
  }
  const other = result.actor === 'driver' ? 'du passager' : 'du conducteur';
  const stageLabel = result.stage === 'pickup' ? 'Embarquement' : 'Dépose';
  if (result.error) return {
    tone: 'danger' as const, phase: 'error', stageLabel, icon: 'close' as const,
    title: 'Confirmation non enregistrée', message: result.error,
    status: 'Enregistrement impossible', button: 'Revenir au trajet',
  };
  if (receipt?.state === 'blocked' || receipt?.state === 'disputed' || receipt?.decision === 'reject') return {
    tone: 'danger' as const, phase: receipt.state, stageLabel, icon: 'alert' as const,
    title: receipt.state === 'blocked' ? 'Confirmation non validée' : 'Confirmation à vérifier',
    message: receipt.state === 'blocked' ? receipt.message ?? 'Le serveur ne peut pas valider cette réponse. Consultez les confirmations du trajet.'
      : 'Les réponses ne concordent pas. Consultez les confirmations du trajet et contactez l’assistance si nécessaire.',
    status: 'Une vérification est nécessaire', button: 'Revenir au trajet',
  };
  if (receipt?.state === 'confirmed') return {
    tone: 'success' as const, phase: 'confirmed', stageLabel, icon: 'checkmark' as const,
    title: result.stage === 'pickup' ? 'Embarquement confirmé' : 'Dépose confirmée',
    message: result.stage === 'pickup' ? 'La prise en charge est validée. Vous pouvez poursuivre le trajet.'
      : 'L’arrivée de cette réservation est validée. Le règlement reste suivi séparément.',
    status: 'Validé par le serveur', button: result.stage === 'pickup' ? 'Continuer le trajet' : 'Continuer',
  };
  if (snapshot?.bookingId === result.bookingId && snapshot.tripId === result.tripId && snapshot.actor === result.actor && snapshot[result.stage].status === 'ready') return {
    tone: 'pending' as const, phase: 'ready', stageLabel, icon: 'time-outline' as const,
    title: 'Validation en cours', message: 'Les deux confirmations sont reçues. Le serveur termine la validation de cette étape.',
    status: 'Les deux réponses sont reçues', button: 'Compris',
  };
  if (receipt?.state === 'received') return {
    tone: 'pending' as const, phase: 'received', stageLabel, icon: 'time-outline' as const,
    title: 'Votre confirmation est reçue',
    message: `En attente de la validation ${other}. L’étape est confirmée après vos deux validations ou par la détection automatique.`,
    status: 'Réponse reçue par le serveur', button: 'Compris',
  };
  return {
    tone: 'pending' as const, phase: receipt?.state ?? 'queued', stageLabel, icon: 'cloud-upload-outline' as const,
    title: 'Confirmation enregistrée',
    message: 'Votre réponse est sauvegardée sur ce téléphone. Elle sera transmise dès que la connexion le permet. Inutile de confirmer de nouveau.',
    status: receipt?.state === 'sending' ? 'Envoi au serveur en cours…' : 'Enregistré sur ce téléphone', button: 'Compris',
  };
}
