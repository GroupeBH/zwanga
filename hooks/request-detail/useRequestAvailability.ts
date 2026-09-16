import { getRouteCoordinates } from '@/utils/routeApi';
import React, { useEffect, useMemo } from 'react';
import type { Trip, Vehicle, User, TripRequest } from '@/types';

interface Params {
  setDirectAcceptRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  tripRequest: TripRequest | undefined;
  compatibleActiveVehicles: Vehicle[];
  directAcceptVehicleId: string;
  setDirectAcceptVehicleId: React.Dispatch<React.SetStateAction<string>>;
  setIsLoadingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  setRouteCoordinates: React.Dispatch<React.SetStateAction<{ latitude: number; longitude: number; }[] | null>>;
  currentUser: User | undefined;
  assignedTrip: Trip | undefined;
  isDriverAccount: boolean;
  isIdentityVerified: boolean;
  showDirectAcceptModal: boolean;
  isAcceptingTripRequest: boolean;
  setShowDirectAcceptModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useRequestAvailability({
  setDirectAcceptRequiresPassengerKyc,
  tripRequest,
  compatibleActiveVehicles,
  directAcceptVehicleId,
  setDirectAcceptVehicleId,
  setIsLoadingRoute,
  setRouteCoordinates,
  currentUser,
  assignedTrip,
  isDriverAccount,
  isIdentityVerified,
  showDirectAcceptModal,
  isAcceptingTripRequest,
  setShowDirectAcceptModal,
}: Params) {
  useEffect(() => {
    setDirectAcceptRequiresPassengerKyc(false);
  }, [tripRequest?.id]);

  const directAcceptVehicle = useMemo(
    () =>
      compatibleActiveVehicles.find(
        (vehicle) => vehicle.id === directAcceptVehicleId,
      ) ?? null,
    [compatibleActiveVehicles, directAcceptVehicleId],
  );

  useEffect(() => {
    setDirectAcceptVehicleId((currentVehicleId) => {
      if (compatibleActiveVehicles.some((vehicle) => vehicle.id === currentVehicleId)) {
        return currentVehicleId;
      }

      return compatibleActiveVehicles.length === 1 ? compatibleActiveVehicles[0].id : '';
    });
  }, [compatibleActiveVehicles]);

  const directAcceptDepartureDate = useMemo(() => {
    if (!tripRequest) return null;

    const minDate = new Date(tripRequest.departureDateMin);
    const maxDate = new Date(tripRequest.departureDateMax);
    const now = new Date();
    const preferredDate = minDate > now ? minDate : now;

    return preferredDate <= maxDate ? preferredDate : maxDate;
  }, [tripRequest]);

  // Charger les coordonnées de la route réelle
  useEffect(() => {
    const loadRoute = async () => {
      if (!tripRequest?.departure?.lat || !tripRequest?.departure?.lng || 
          !tripRequest?.arrival?.lat || !tripRequest?.arrival?.lng) {
        return;
      }

      setIsLoadingRoute(true);
      try {
        const departureCoordinate = {
          latitude: tripRequest.departure.lat,
          longitude: tripRequest.departure.lng,
        };
        const arrivalCoordinate = {
          latitude: tripRequest.arrival.lat,
          longitude: tripRequest.arrival.lng,
        };

        const coordinates = await getRouteCoordinates(departureCoordinate, arrivalCoordinate);
        if (coordinates && coordinates.length > 0) {
          setRouteCoordinates(coordinates);
        } else {
          // Fallback sur ligne droite si l'API échoue
          setRouteCoordinates([
            departureCoordinate,
            arrivalCoordinate,
          ]);
        }
      } catch (error) {
        console.warn('Error loading route for trip request:', error);
        // Fallback sur ligne droite en cas d'erreur
        if (tripRequest?.departure?.lat && tripRequest?.departure?.lng && 
            tripRequest?.arrival?.lat && tripRequest?.arrival?.lng) {
          setRouteCoordinates([
            { latitude: tripRequest.departure.lat, longitude: tripRequest.departure.lng },
            { latitude: tripRequest.arrival.lat, longitude: tripRequest.arrival.lng },
          ]);
        }
      } finally {
        setIsLoadingRoute(false);
      }
    };

    loadRoute();
  }, [tripRequest?.departure?.lat, tripRequest?.departure?.lng, tripRequest?.arrival?.lat, tripRequest?.arrival?.lng]);

  const isOwner = useMemo(
    () => tripRequest && currentUser && tripRequest.passengerId === currentUser.id,
    [tripRequest, currentUser]
  );

  // Vérifier si la demande peut être modifiée
  const canEdit = useMemo(() => {
    if (!isOwner || !tripRequest) return false;
    // Ne peut pas modifier si une offre a été acceptée ou si un driver a été sélectionné
    if (tripRequest.status === 'driver_selected' || tripRequest.selectedDriverId) return false;
    // Ne peut modifier que si le statut est 'pending' ou 'offers_received'
    return tripRequest.status === 'pending' || tripRequest.status === 'offers_received';
  }, [isOwner, tripRequest]);

  const canCancel = useMemo(() => {
    if (!isOwner || !tripRequest) return false;

    const isActiveRequest =
      tripRequest.status === 'pending' ||
      tripRequest.status === 'offers_received' ||
      tripRequest.status === 'driver_selected';
    if (!isActiveRequest) return false;

    return (
      !tripRequest.tripId ||
      (assignedTrip?.status === 'upcoming' && !assignedTrip.startedAt)
    );
  }, [assignedTrip?.startedAt, assignedTrip?.status, isOwner, tripRequest]);

  const hasExistingOffer = useMemo(() => {
    if (!tripRequest?.offers || !currentUser) return false;
    return tripRequest.offers.some(
      (offer) => offer.driverId === currentUser.id && offer.status === 'pending'
    );
  }, [tripRequest, currentUser]);

  // Vérifier s'il y a une offre acceptée
  const hasAcceptedOffer = useMemo(() => {
    if (!tripRequest?.offers) return false;
    return tripRequest.offers.some((offer) => offer.status === 'accepted');
  }, [tripRequest?.offers]);

  const canAcceptRequest = useMemo(() => {
    if (!isDriverAccount || !isIdentityVerified || isOwner || hasExistingOffer) {
      return false;
    }

    // Permettre l'acceptation directe tant qu'aucun conducteur n'a été retenu.
    const isRequestOpen = tripRequest?.status === 'pending' || tripRequest?.status === 'offers_received';
    if (!isRequestOpen) {
      return false;
    }

    // Vérifier aussi s'il y a déjà une offre acceptée (même si le statut n'est pas encore 'driver_selected')
    // Cela correspond à la logique backend qui filtre les demandes avec des offres acceptées
    if (hasAcceptedOffer) {
      return false;
    }

    return true;
  }, [
    hasAcceptedOffer,
    hasExistingOffer,
    isDriverAccount,
    isIdentityVerified,
    isOwner,
    tripRequest?.status,
  ]);

  const myOffer = useMemo(() => {
    if (!tripRequest?.offers || !currentUser) return null;
    return tripRequest.offers.find((offer) => offer.driverId === currentUser.id);
  }, [tripRequest, currentUser]);

  const isCurrentDriverAssigned = useMemo(() => {
    if (!currentUser?.id) {
      return myOffer?.status === 'accepted';
    }

    if (tripRequest?.selectedDriverId) {
      return tripRequest.selectedDriverId === currentUser.id;
    }

    return myOffer?.status === 'accepted';
  }, [currentUser?.id, myOffer?.status, tripRequest?.selectedDriverId]);

  const canOpenAssignedTrip = useMemo(
    () => isCurrentDriverAssigned && !!tripRequest?.tripId,
    [isCurrentDriverAssigned, tripRequest?.tripId]
  );

  const canStartAssignedTrip = useMemo(
    () => isCurrentDriverAssigned && tripRequest?.status === 'driver_selected' && !tripRequest?.tripId,
    [isCurrentDriverAssigned, tripRequest?.status, tripRequest?.tripId]
  );

  const canAcceptDirectly = useMemo(
    () => canAcceptRequest && compatibleActiveVehicles.length > 0,
    [canAcceptRequest, compatibleActiveVehicles.length],
  );

  useEffect(() => {
    if (showDirectAcceptModal && !isAcceptingTripRequest &&
      (tripRequest?.status === 'expired' || tripRequest?.status === 'cancelled')) {
      setShowDirectAcceptModal(false);
    }
  }, [isAcceptingTripRequest, showDirectAcceptModal, tripRequest?.status]);

  return {
    directAcceptDepartureDate,
    canAcceptRequest,
    directAcceptVehicle,
    isCurrentDriverAssigned,
    canOpenAssignedTrip,
    canStartAssignedTrip,
    canAcceptDirectly,
    myOffer,
    isOwner,
    canEdit,
    canCancel,
  };
}
