import { RequestReferenceField } from '@/components/trip-request/RequestReferenceField';
import { requiresRequestReference } from '@/features/trip-request/requestReference';
import type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
import type { TripEditReferences } from '@/hooks/trips/useTripEditReferences';
import { matchingReferenceLocation } from './tripEditReferences';
import { useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { tripEditorStyles as s } from './tripEditorStyles';

export interface TripEditReferenceProps {
  editReferences: TripEditReferences;
  editDepartureSelection: MapLocationSelection | null;
  editArrivalSelection: MapLocationSelection | null;
}

export function TripEditReferenceFields({ editReferences, editDepartureSelection, editArrivalSelection,
  departureAddress, arrivalAddress, target, disabled = false, showOptional }: TripEditReferenceProps & {
    departureAddress: string; arrivalAddress: string; target?: 'departure' | 'arrival'; disabled?: boolean; showOptional?: boolean;
  }) {
  return <>
    {target !== 'arrival' && <TripEditReferenceInput target="departure" value={editReferences.departureReference} disabled={disabled} showOptional={showOptional}
      onChangeText={editReferences.setDepartureReference}
      required={requiresRequestReference(departureAddress, matchingReferenceLocation(departureAddress, editDepartureSelection))} />}
    {target !== 'departure' && <TripEditReferenceInput target="arrival" value={editReferences.arrivalReference} disabled={disabled} showOptional={showOptional}
      onChangeText={editReferences.setArrivalReference}
      required={requiresRequestReference(arrivalAddress, matchingReferenceLocation(arrivalAddress, editArrivalSelection))} />}
  </>;
}

function TripEditReferenceInput({ showOptional, ...props }: Parameters<typeof RequestReferenceField>[0] & { showOptional?: boolean }) {
  // A saved optional reference must stay editable when its last character is erased.
  const [expanded, setExpanded] = useState(Boolean(props.value));
  if (props.required || props.value || expanded || showOptional) return <RequestReferenceField {...props} keepHintVisible />;
  if (showOptional === false) return null;
  return <TouchableOpacity accessibilityRole="button" disabled={props.disabled} style={s.link}
    onPress={() => { if (!props.disabled) setExpanded(true); }}>
    <Text style={s.linkText}>+ Repère {props.target === 'departure' ? 'au départ' : 'à l’arrivée'}</Text>
  </TouchableOpacity>;
}
