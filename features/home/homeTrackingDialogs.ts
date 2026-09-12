import type { HomeAutoProgressEvent } from '@/features/home/homeTypes';
import type { Booking } from '@/types';
import { Ionicons } from '@expo/vector-icons';

export function getHomeTrackingDialog(event: HomeAutoProgressEvent, booking: Booking | null, isHomeDriverTracking: boolean) {
  const passengerName = booking?.passengerName || 'le passager';
  const roundedDistance =
    typeof event.distanceMeters === 'number' && Number.isFinite(event.distanceMeters)
      ? Math.max(1, Math.round(event.distanceMeters))
      : null;
  const distanceText = roundedDistance ? ` Distance détectée: ${roundedDistance} m.` : '';
  const isTripDestinationReachedZone =
    event.type === 'driver_near_destination' &&
    roundedDistance !== null &&
    roundedDistance <= 10;

  const dialogByType: Record<
    HomeAutoProgressEvent['type'],
    {
      variant: 'info' | 'success' | 'warning';
      icon: keyof typeof Ionicons.glyphMap;
      title: string;
      message: string;
    }
  > = {
    driver_near_pickup: {
      variant: 'info',
      icon: 'car-sport',
      title: 'Le conducteur sera bientôt là',
      message: `Le conducteur est proche du point de récupération.${distanceText}`,
    },
    driver_arrived_pickup: {
      variant: 'info',
      icon: 'location',
      title: isHomeDriverTracking ? 'Point de récupération atteint' : 'Le conducteur est là',
      message: isHomeDriverTracking
        ? `Vous êtes arrivé au point de récupération de ${passengerName}. Le passager est notifié.`
        : 'Le conducteur est arrivé au point de récupération que vous avez indiqué.',
    },
    parties_nearby: {
      variant: 'success',
      icon: 'people',
      title: isHomeDriverTracking ? 'Passager prêt à embarquer' : 'Vous êtes au point',
      message: isHomeDriverTracking
        ? `${passengerName} est là et prêt à être embarqué.`
        : 'Vous et le conducteur êtes au point de récupération.',
    },
    passenger_ready_pickup: {
      variant: 'success',
      icon: 'hand-left',
      title: "Le passager s'est signale",
      message: `${passengerName} indique qu'il est au point de récupération.`,
    },
    pickup_confirmed: {
      variant: 'success',
      icon: 'checkmark-circle',
      title: isHomeDriverTracking ? 'Passager embarqué' : 'Prise en charge confirmée',
      message: isHomeDriverTracking
        ? `${passengerName} a été embarqué.`
        : 'Votre prise en charge est confirmée.',
    },
    passenger_no_show: {
      variant: 'info',
      icon: 'person-remove',
      title: isHomeDriverTracking ? 'Passager non embarqué' : 'Non-embarquement détecté',
      message: isHomeDriverTracking
        ? `${passengerName} n'a pas été embarqué. La réservation est clôturée sans paiement.`
        : "Votre embarquement n'a pas été détecté. La réservation est clôturée sans paiement.",
    },
    passenger_boarding_uncertain: {
      variant: 'warning',
      icon: 'help-circle',
      title: 'Embarquement non confirmé',
      message: isHomeDriverTracking
        ? `Le trajet est arrivé à destination sans preuve GPS suffisante de l'embarquement de ${passengerName}. Aucun paiement n'est effectué.`
        : "Le trajet est arrivé à destination sans preuve GPS suffisante de votre embarquement. Aucun paiement n'est effectué.",
    },
    passenger_near_destination: {
      variant: 'info',
      icon: 'flag',
      title: isHomeDriverTracking ? 'Destination passager proche' : 'Votre arrivée approche',
      message: isHomeDriverTracking
        ? `Le point d'arrivée de ${passengerName} va être atteint.${distanceText}`
        : `Votre point d'arrivée va être atteint.${distanceText}`,
    },
    dropoff_confirmed: {
      variant: 'success',
      icon: 'flag',
      title: isHomeDriverTracking ? 'Destination passager atteinte' : 'Arrivée confirmée',
      message: isHomeDriverTracking
        ? `Nous sommes arrivés au point de destination de ${passengerName}.`
        : 'Votre arrivée à destination est confirmée.',
    },
    driver_near_destination: {
      variant: 'info',
      icon: 'flag',
      title: isTripDestinationReachedZone
        ? 'Destination finale atteinte'
        : 'Destination finale proche',
      message: isTripDestinationReachedZone
        ? `Le point d'arrivée du trajet est atteint. Le trajet sera terminé automatiquement dans 10 minutes si le véhicule reste sur place.${distanceText}`
        : `Le point d'arrivée du trajet est presque atteint.${distanceText}`,
    },
    driver_arrived_destination: {
      variant: 'success',
      icon: 'flag',
      title: 'Trajet terminé',
      message: `Vous avez atteint la destination finale.${distanceText}`,
    },
  };

  return dialogByType[event.type];
}
