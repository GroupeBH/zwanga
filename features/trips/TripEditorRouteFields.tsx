import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Keyboard, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ACTION_COLORS } from '@/constants/actionColors';
import { TripEditReferenceFields, type TripEditReferenceProps } from './TripEditReferenceFields';
import { getLocationText } from './tripsModel';
import { tripEditorStyles as s } from './tripEditorStyles';
import { requiresRequestReference } from '@/features/trip-request/requestReference';
import { matchingReferenceLocation } from './tripEditReferences';

export interface TripEditorRouteFieldsProps extends TripEditReferenceProps {
  swapEditRoutePoints: () => void;
  editRouteMode: 'map' | 'manual';
  setEditRouteMode: React.Dispatch<React.SetStateAction<'map' | 'manual'>>;
  editDepartureManualAddress: string;
  setEditDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  editArrivalManualAddress: string;
  setEditArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  handleContinueEditTrip: () => void;
  openEditRoutePicker: (target: 'departure' | 'arrival') => void;
  editDepartureDisplay: string;
  editArrivalDisplay: string;
  disabled?: boolean;
}

export function TripEditorRouteFields(props: TripEditorRouteFieldsProps) {
  const { editRouteMode, setEditRouteMode, editReferences, disabled = false } = props;
  const arrivalInput = useRef<TextInput>(null);
  const [showReferences, setShowReferences] = useState(false);
  const manual = editRouteMode === 'manual';
  const departureAddress = manual ? props.editDepartureManualAddress : getLocationText(props.editDepartureSelection, '');
  const arrivalAddress = manual ? props.editArrivalManualAddress : getLocationText(props.editArrivalSelection, '');
  const hasHiddenReference = !showReferences && (
    !editReferences.departureReference && !requiresRequestReference(departureAddress, matchingReferenceLocation(departureAddress, props.editDepartureSelection)) ||
    !editReferences.arrivalReference && !requiresRequestReference(arrivalAddress, matchingReferenceLocation(arrivalAddress, props.editArrivalSelection)));
  return <View style={s.section}>
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>Votre itinéraire</Text>
      <TouchableOpacity style={s.close} onPress={props.swapEditRoutePoints} disabled={disabled}
        accessibilityRole="button" accessibilityLabel="Inverser le départ et l’arrivée" accessibilityState={{ disabled }}>
        <Ionicons name="swap-vertical" size={20} color={ACTION_COLORS.orange} />
      </TouchableOpacity>
    </View>
    <View style={s.route}>
      {(['departure', 'arrival'] as const).map((target, index) => {
        const start = target === 'departure';
        const label = start ? 'Départ' : 'Arrivée';
        const value = start ? props.editDepartureManualAddress : props.editArrivalManualAddress;
        const display = start ? props.editDepartureDisplay : props.editArrivalDisplay;
        const content = <>
          <Ionicons name={start ? 'locate-outline' : 'location-outline'} size={20} color={ACTION_COLORS.orange} />
          <View style={s.grow}><Text style={s.label}>{label}</Text>
            {manual ? <TextInput ref={start ? undefined : arrivalInput} style={s.input}
              accessibilityLabel={start ? 'Adresse de départ' : 'Adresse d’arrivée'} editable={!disabled}
              placeholder={start ? 'Avenue, quartier…' : 'Avenue, lieu…'} value={value} onChangeText={next => {
                if (disabled) return;
                editReferences.clearIfAddressChanged(target, next, value);
                (start ? props.setEditDepartureManualAddress : props.setEditArrivalManualAddress)(next);
              }} returnKeyType={start ? 'next' : 'done'}
              onSubmitEditing={() => { if (!disabled) { if (start) arrivalInput.current?.focus(); else Keyboard.dismiss(); } }} />
              : <Text style={s.value} numberOfLines={2}>{display}</Text>}
          </View>
          {!manual && <Ionicons name="pencil-outline" size={17} color={ACTION_COLORS.orange} />}
        </>;
        return <View key={target}>
          {index > 0 && <View style={s.divider} />}
          {manual ? <View style={s.routeRow}>{content}</View> :
            <TouchableOpacity style={s.routeRow} onPress={() => { if (!disabled) props.openEditRoutePicker(target); }}
              disabled={disabled} accessibilityRole="button" accessibilityLabel={`Modifier ${label.toLowerCase()} : ${display}`}
              accessibilityState={{ disabled }}>{content}</TouchableOpacity>}
          <TripEditReferenceFields {...props} target={target} departureAddress={departureAddress} arrivalAddress={arrivalAddress}
            disabled={disabled} showOptional={showReferences} />
        </View>;
      })}
    </View>
    <View style={[s.row, s.wrap, { justifyContent: 'space-between' }]}>
      <TouchableOpacity style={s.link} disabled={disabled} accessibilityRole="button" onPress={() => {
        if (!disabled) { Keyboard.dismiss(); setEditRouteMode(manual ? 'map' : 'manual'); }
      }}><Text style={s.linkText}>{manual ? 'Choisir sur la carte' : 'Saisir les adresses'}</Text></TouchableOpacity>
      {hasHiddenReference && <TouchableOpacity style={s.link} disabled={disabled} accessibilityRole="button"
        onPress={() => { if (!disabled) setShowReferences(true); }}>
        <Text style={s.linkText}>Ajouter un repère</Text>
      </TouchableOpacity>}
    </View>
  </View>;
}
