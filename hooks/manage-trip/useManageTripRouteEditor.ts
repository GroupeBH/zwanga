import { trackEvent } from '@/services/analytics';
import { useGeocodeMutation } from '@/store/api/googleMapsApi';
import { useUpdateTripMutation } from '@/store/api/tripApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { buildManualGeocodeQuery, mapGeocodeResponseToSelection } from '@/utils/manualAddressGeocode';
import React, { useCallback } from 'react';
import type { Trip } from '@/types';

interface Params {
  trip: Trip | undefined;
  setEditDepartureAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditArrivalAddress: React.Dispatch<React.SetStateAction<string>>;
  setEditRouteError: React.Dispatch<React.SetStateAction<string>>;
  setEditRouteModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSavingRoute: boolean;
  geocodeManualAddress: ReturnType<typeof useGeocodeMutation>[0];
  editDepartureAddress: string;
  editArrivalAddress: string;
  setIsResolvingRoute: React.Dispatch<React.SetStateAction<boolean>>;
  updateTripRoute: ReturnType<typeof useUpdateTripMutation>[0];
  showFeedback: (type: "success" | "error", message: string | string[]) => void;
  refreshAll: () => Promise<void>;
}

export function useManageTripRouteEditor({
  trip,
  setEditDepartureAddress,
  setEditArrivalAddress,
  setEditRouteError,
  setEditRouteModalVisible,
  isSavingRoute,
  geocodeManualAddress,
  editDepartureAddress,
  editArrivalAddress,
  setIsResolvingRoute,
  updateTripRoute,
  showFeedback,
  refreshAll,
}: Params) {
  const openEditRouteModal = () => {
    if (!trip || trip.status !== 'upcoming') {
      return;
    }
    setEditDepartureAddress((trip.departure.address || '').trim());
    setEditArrivalAddress((trip.arrival.address || '').trim());
    setEditRouteError('');
    setEditRouteModalVisible(true);
  };

  const closeEditRouteModal = () => {
    if (isSavingRoute) return;
    setEditRouteModalVisible(false);
    setEditRouteError('');
  };

  const resolveManualRouteCoordinates = useCallback(
    async (address: string, label: string): Promise<[number, number] | null> => {
      const trimmedAddress = address.trim();
      if (!trimmedAddress) {
        return null;
      }

      try {
        const response = await geocodeManualAddress({
          address: buildManualGeocodeQuery(trimmedAddress),
          region: 'cd',
        }).unwrap();
        const selection = mapGeocodeResponseToSelection(trimmedAddress, response);
        if (!selection) {
          return null;
        }
        return [selection.longitude, selection.latitude];
      } catch (error) {
        console.warn(`Manual ${label} geocode failed`, error);
        return null;
      }
    },
    [geocodeManualAddress],
  );

  const handleSaveRouteAddresses = async () => {
    if (!trip || isSavingRoute) return;

    const nextDeparture = editDepartureAddress.trim();
    const nextArrival = editArrivalAddress.trim();

    if (!nextDeparture || !nextArrival) {
      setEditRouteError("Renseignez les adresses de départ et d'arrivée.");
      return;
    }

    if (nextDeparture.toLowerCase() === nextArrival.toLowerCase()) {
      setEditRouteError("Les adresses de départ et d'arrivée doivent être differentes.");
      return;
    }

    const currentDeparture = (trip.departure.address || '').trim();
    const currentArrival = (trip.arrival.address || '').trim();
    const updates: {
      departureLocation?: string;
      arrivalLocation?: string;
      departureCoordinates?: [number, number];
      arrivalCoordinates?: [number, number];
    } = {};

    if (nextDeparture !== currentDeparture) {
      updates.departureLocation = nextDeparture;
    }
    if (nextArrival !== currentArrival) {
      updates.arrivalLocation = nextArrival;
    }

    if (!updates.departureLocation && !updates.arrivalLocation) {
      setEditRouteModalVisible(false);
      return;
    }

    setIsResolvingRoute(true);

    if (updates.departureLocation) {
      const coordinates = await resolveManualRouteCoordinates(nextDeparture, 'departure');
      if (!coordinates) {
        setIsResolvingRoute(false);
        setEditRouteError(
          'Impossible de localiser cette adresse de départ. Vérifiez le texte puis réessayez.',
        );
        return;
      }
      updates.departureCoordinates = coordinates;
    }

    if (updates.arrivalLocation) {
      const coordinates = await resolveManualRouteCoordinates(nextArrival, 'arrival');
      if (!coordinates) {
        setIsResolvingRoute(false);
        setEditRouteError(
          'Impossible de localiser cette adresse d\'arrivée. Vérifiez le texte puis réessayez.',
        );
        return;
      }
      updates.arrivalCoordinates = coordinates;
    }

    try {
      await updateTripRoute({ id: trip.id, updates }).unwrap();
      void trackEvent('trip_route_updated', {
        trip_id: trip.id,
        source_screen: 'trip_manage',
        departure_updated: Boolean(updates.departureLocation),
        arrival_updated: Boolean(updates.arrivalLocation),
      });
      setEditRouteModalVisible(false);
      setEditRouteError('');
      showFeedback('success', 'Les adresses du trajet ont été mises à jour.');
      refreshAll();
    } catch (error: any) {
      setEditRouteError(
        getApiErrorMessage(error, 'Impossible de mettre à jour les adresses du trajet.'),
      );
    } finally {
      setIsResolvingRoute(false);
    }
  };

  return {
    openEditRouteModal,
    closeEditRouteModal,
    handleSaveRouteAddresses,
  };
}
