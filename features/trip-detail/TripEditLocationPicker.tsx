import LocationPickerModal from '@/components/LocationPickerModal';
import type { useTripDetailController } from '@/hooks/trip-detail/useTripDetailController';

type Props = { editing: ReturnType<typeof useTripDetailController>['editing'] };

/** Keep the edit draft and reference reset together when picking a route endpoint. */
export function TripEditLocationPicker({ editing }: Props) {
  const { edit, editRoute } = editing;
  const target = edit.editRoutePickerTarget;
  return <LocationPickerModal
    visible={target !== null}
    title={target === 'departure' ? 'Choisir le départ' : "Choisir l'arrivée"}
    initialLocation={target === 'departure' ? edit.editDepartureSelection : edit.editArrivalSelection}
    autoLocateOnOpen={false}
    onClose={editRoute.restoreEditModalAfterRoutePicker}
    onSelect={(location) => {
      edit.setEditRouteMode('map');
      if (target === 'departure') {
        edit.editReferences.clearIfLocationChanged(target, location, edit.editDepartureSelection);
        edit.setEditDepartureSelection(location);
        edit.setEditDepartureManualAddress(location.title || location.address);
      } else if (target === 'arrival') {
        edit.editReferences.clearIfLocationChanged(target, location, edit.editArrivalSelection);
        edit.setEditArrivalSelection(location);
        edit.setEditArrivalManualAddress(location.title || location.address);
      }
      editRoute.restoreEditModalAfterRoutePicker();
    }}
  />;
}
