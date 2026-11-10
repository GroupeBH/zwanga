import { RequestReferenceField } from '@/components/trip-request/RequestReferenceField';
import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
import { requiresRequestReference } from '@/features/trip-request/requestReference';

export interface RequestEditReferenceProps {
  editDepartureLocation: MapLocationSelection | null;
  editArrivalLocation: MapLocationSelection | null;
  editDepartureReference: string;
  editArrivalReference: string;
  setEditDepartureReference: (value: string) => void;
  setEditArrivalReference: (value: string) => void;
}

export function RequestEditReferences(props: RequestEditReferenceProps & {
  editAddressInputMode: string; editDepartureAddress: string; editArrivalAddress: string;
}) {
  return <>{(['departure', 'arrival'] as const).map(target => {
    const departure = target === 'departure';
    const address = departure ? props.editDepartureAddress : props.editArrivalAddress;
    const location = props.editAddressInputMode === 'map'
      ? departure ? props.editDepartureLocation : props.editArrivalLocation : null;
    return <RequestReferenceField key={target} target={target} required={requiresRequestReference(address, location)}
      value={departure ? props.editDepartureReference : props.editArrivalReference}
      onChangeText={departure ? props.setEditDepartureReference : props.setEditArrivalReference} />;
  })}</>;
}
