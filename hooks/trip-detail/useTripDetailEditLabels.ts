import { type MapLocationSelection } from '@/components/LocationPickerModal';
import { useMemo } from 'react';
import { Platform } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface Params {
  editDateTime: Date | null;
  editRouteMode: "map" | "manual";
  editDepartureManualAddress: string;
  editDepartureSelection: MapLocationSelection | null;
  editArrivalManualAddress: string;
  editArrivalSelection: MapLocationSelection | null;
  insets: EdgeInsets;
}

export function useTripDetailEditLabels({
  editDateTime,
  editRouteMode,
  editDepartureManualAddress,
  editDepartureSelection,
  editArrivalManualAddress,
  editArrivalSelection,
  insets,
}: Params) {
  const formattedEditDate = useMemo(() => {
    if (!editDateTime) return 'Choisir la date';
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(editDateTime);
  }, [editDateTime]);

  const formattedEditTime = useMemo(() => {
    if (!editDateTime) return 'Choisir l\'heure';
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(editDateTime);
  }, [editDateTime]);

  const editDepartureDisplay = useMemo(() => {
    if (editRouteMode === 'manual') {
      return editDepartureManualAddress.trim() || 'Renseigner le départ';
    }
    return (
      editDepartureSelection?.title ||
      editDepartureSelection?.address ||
      editDepartureManualAddress.trim() ||
      'Choisir le point de départ'
    );
  }, [editDepartureManualAddress, editDepartureSelection, editRouteMode]);

  const editArrivalDisplay = useMemo(() => {
    if (editRouteMode === 'manual') {
      return editArrivalManualAddress.trim() || "Renseigner l'arrivée";
    }
    return (
      editArrivalSelection?.title ||
      editArrivalSelection?.address ||
      editArrivalManualAddress.trim() ||
      "Choisir le point d'arrivée"
    );
  }, [editArrivalManualAddress, editArrivalSelection, editRouteMode]);

  const editModalBottomPadding = Platform.OS === 'android' ? 16 : Math.max(insets.bottom, 16) + 8;

  return {
    editModalBottomPadding,
    editDepartureDisplay,
    editArrivalDisplay,
    formattedEditDate,
    formattedEditTime,
  };
}
