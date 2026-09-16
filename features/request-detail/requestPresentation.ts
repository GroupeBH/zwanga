import { RequestRouteMapData, TRIP_REQUEST_VEHICLE_LABELS } from './requestDetailModel';
import { Colors } from '@/constants/styles';
import type { TripRequestVehicleType } from '@/types';
import type { Vehicle, TripRequest, DriverOffer } from '@/types';

interface Params {
  tripRequest: TripRequest;
  routeCoordinates: { latitude: number; longitude: number; }[] | null;
  canOpenAssignedTrip: boolean;
  canStartAssignedTrip: boolean;
  canAcceptDirectly: boolean;
  myOffer: DriverOffer | null | undefined;
  isDriverAccount: boolean;
  isIdentityVerified: boolean;
  compatibleActiveVehicles: Vehicle[];
  requestedVehicleType: TripRequestVehicleType;
}

export function buildRequestDetailPresentation({
  tripRequest,
  routeCoordinates,
  canOpenAssignedTrip,
  canStartAssignedTrip,
  canAcceptDirectly,
  myOffer,
  isDriverAccount,
  isIdentityVerified,
  compatibleActiveVehicles,
  requestedVehicleType,
}: Params) {
  const request = tripRequest;
  const departureLat = tripRequest.departure?.lat;
  const departureLng = tripRequest.departure?.lng;
  const arrivalLat = tripRequest.arrival?.lat;
  const arrivalLng = tripRequest.arrival?.lng;
  let requestRouteMapData: RequestRouteMapData | null = null;

  if (
    typeof departureLat === 'number' &&
    typeof departureLng === 'number' &&
    typeof arrivalLat === 'number' &&
    typeof arrivalLng === 'number'
  ) {
    const departureCoordinate = { latitude: departureLat, longitude: departureLng };
    const arrivalCoordinate = { latitude: arrivalLat, longitude: arrivalLng };

    requestRouteMapData = {
      departureCoordinate,
      arrivalCoordinate,
      fallbackCoordinates: [departureCoordinate, arrivalCoordinate],
      initialRegion: {
        latitude: (departureLat + arrivalLat) / 2,
        longitude: (departureLng + arrivalLng) / 2,
        latitudeDelta: Math.max(Math.abs(departureLat - arrivalLat) * 1.45, 0.012),
        longitudeDelta: Math.max(Math.abs(departureLng - arrivalLng) * 1.45, 0.012),
      },
    };
  }

  const displayedRouteCoordinates = routeCoordinates ?? [];
  const statusConfigMap = {
    pending: { label: 'En attente', color: Colors.warning, bg: Colors.warning + '15' },
    offers_received: { label: 'Réponses reçues', color: Colors.info, bg: Colors.info + '15' },
    driver_selected: { label: 'Conducteur choisi', color: Colors.success, bg: Colors.success + '15' },
    cancelled: { label: 'Annulée', color: Colors.danger, bg: Colors.danger + '15' },
    expired: { label: 'Expirée', color: Colors.gray[500], bg: Colors.gray[200] },
  };
  const statusConfig = statusConfigMap[tripRequest.status] || statusConfigMap.pending;

  const isRequestClosed = tripRequest.status === 'expired' || tripRequest.status === 'cancelled';
  const pendingOffersCount = isRequestClosed ? 0 : tripRequest.offers?.filter((offer) => offer.status === 'pending').length ?? 0;
  const ownerDisplayedBudget = tripRequest.selectedPricePerSeat ?? tripRequest.maxPricePerSeat;
  const heroStepIndex =
    isRequestClosed ? -1 : tripRequest.tripId
      ? 3
      : tripRequest.status === 'driver_selected'
        ? 2
        : tripRequest.status === 'offers_received' || pendingOffersCount > 0
          ? 1
          : tripRequest.status === 'pending'
            ? 0
            : -1;
  const heroSteps = ['Demande', 'Réponses', 'Conducteur', 'Départ'];
  const ownerHero = (() => {
    if (isRequestClosed) {
      return {
        title: tripRequest.status === 'expired' ? 'Votre demande a expiré' : 'Votre demande est annulée',
        subtitle: tripRequest.tripId
          ? "Cette demande n'est plus active. Le trajet associé reste consultable."
          : "Cette demande n'est plus disponible. Vous pouvez créer une nouvelle demande.",
      };
    }
    if (tripRequest.tripId) {
      return {
        title: 'Votre course est prête',
        subtitle: 'Le trajet a déjà été créé. Vous pouvez maintenant suivre la course en direct.',
      };
    }
    if (tripRequest.status === 'driver_selected') {
      return {
        title: tripRequest.selectedDriverName
          ? `${tripRequest.selectedDriverName} prépare votre prise en charge`
          : 'Votre conducteur a été confirmé',
        subtitle: "Cette demande reste active jusqu'à 2 heures après l'heure limite de départ souhaitée.",
      };
    }
    if (tripRequest.status === 'offers_received' || pendingOffersCount > 0) {
      return {
        title:
          pendingOffersCount > 1
            ? `${pendingOffersCount} conducteurs ont répondu`
            : 'Un conducteur a répondu',
        subtitle: "Le conducteur retenu apparaîtra ici dès qu'il sera confirmé.",
      };
    }
    return {
      title: 'Nous cherchons un conducteur',
      subtitle: "Sans conducteur confirmé, votre demande expire 30 secondes après l'heure limite de départ souhaitée.",
    };
  })();
  const ownerHeroHintMessage =
    isRequestClosed
      ? "Cette demande n'est plus disponible pour les conducteurs."
      : pendingOffersCount > 0
        ? 'Les réponses arrivent. Le conducteur retenu apparaîtra ici.'
        : "Vous serez alerté dès qu'un conducteur se manifeste.";
  const driverHero = (() => {
    if (isRequestClosed) {
      return {
        badge: statusConfig.label,
        title: tripRequest.status === 'expired' ? 'Cette demande a expiré' : 'Cette demande est annulée',
        subtitle: "Elle n'est plus disponible. Consultez les autres demandes depuis l'accueil ou la recherche.",
      };
    }
    if (canOpenAssignedTrip) {
      return {
        badge: 'Retenu',
        title: 'Vous pilotez cette course',
        subtitle: 'Le trajet est déjà prêt. Ouvrez-le pour suivre la course ou lancer votre prise en charge.',
      };
    }
    if (canStartAssignedTrip) {
      return {
        badge: 'Confirmé',
        title: 'Cette demande est pour vous',
        subtitle: 'Le passager est déjà réservé. Vous pouvez démarrer le trajet dès maintenant.',
      };
    }
    if (canAcceptDirectly) {
      return {
        badge: 'Immédiat',
        title: 'Vous pouvez accepter cette course maintenant',
        subtitle: 'Choisissez votre véhicule. Le trajet sera ensuite créé immédiatement pour le passager.',
      };
    }
    if (myOffer?.status === 'pending') {
      return {
        badge: 'En attente',
        title: 'Votre ancienne réponse est encore en attente',
        subtitle: 'Vous serez notifié dès que son statut évoluera.',
      };
    }
    if (myOffer?.status === 'rejected') {
      return {
        badge: 'Clôturé',
        title: 'Votre ancienne réponse n\'a pas été retenue',
        subtitle: 'Vous pouvez consulter d\'autres demandes disponibles depuis l\'accueil ou la liste des demandes.',
      };
    }
    if (!isDriverAccount) {
      return {
        badge: 'Profil',
        title: 'Activez votre profil conducteur',
        subtitle: 'Cette demande est ouverte, mais votre compte doit devenir conducteur pour l\'accepter.',
      };
    }
    if (!isIdentityVerified) {
      return {
        badge: 'Identité',
        title: 'Vérifiez votre identité pour accepter',
        subtitle: 'Une vérification rapide est nécessaire avant d\'accepter cette demande.',
      };
    }
    if (compatibleActiveVehicles.length === 0) {
      return {
        badge: 'Véhicule',
        title: `${TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]} requise pour cette course`,
        subtitle: 'Aucun de vos véhicules actifs ne correspond au type demandé.',
      };
    }
    return {
      badge: statusConfig.label,
      title: 'Cette demande n’est pas disponible',
      subtitle: 'Actualisez l’écran ou consultez une autre demande de trajet.',
    };
  })();

  return {
    statusConfig,
    pendingOffersCount,
    ownerHero,
    requestRouteMapData,
    displayedRouteCoordinates,
    ownerDisplayedBudget,
    heroStepIndex,
    heroSteps,
    ownerHeroHintMessage,
    driverHero,
    request,
  };
}
