import LocationPickerModal from '@/components/LocationPickerModal';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { RequestEditModal } from './RequestEditModal';

/** Reuse the existing editor and submission safeguards from the request detail. */
export function RequestOwnerModals({ model }: { model: ReturnType<typeof useRequestDetailController> }) {
  return <>
    {model.showEditForm && <RequestEditModal {...model} />}
    {model.editLocationPickerType && <LocationPickerModal
      visible={model.editActivePicker !== null} onClose={model.restoreEditFormAfterLocationPicker}
      onSelect={location => {
        if (model.editLocationPickerType === 'departure') {
          model.setEditDepartureLocation(location);
          model.setEditDepartureManualAddress(location.title || location.address);
        } else {
          model.setEditArrivalLocation(location);
          model.setEditArrivalManualAddress(location.title || location.address);
        }
        model.setEditAddressInputMode('map');
        model.restoreEditFormAfterLocationPicker();
      }} initialLocation={model.editLocationPickerType === 'departure' ? model.editDepartureLocation : model.editArrivalLocation} />}
  </>;
}
