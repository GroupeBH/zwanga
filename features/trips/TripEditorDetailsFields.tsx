import React, { useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { Trip, Vehicle } from '@/types';
import { ACTION_COLORS } from '@/constants/actionColors';
import { requestTripPriceLabel } from '@/features/trip-request/requestPriceDisplay';
import { TripEditorVehiclePicker } from './TripEditorVehiclePicker';
import { tripEditorStyles as s } from './tripEditorStyles';

export interface TripEditorDetailsProps {
  trip: Trip | undefined;
  editVehiclesLoading: boolean;
  activeEditVehicles: Vehicle[];
  editVehicleId: string | null;
  setEditVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
  openDateOrTimePicker: (mode: 'date' | 'time') => void;
  formattedEditDate: string;
  formattedEditTime: string;
  iosPickerMode: 'date' | 'time' | null;
  getEditBaseDate: () => Date;
  handleIosPickerChange: (event: DateTimePickerEvent, date?: Date) => void;
  closeIosPicker: () => void;
  editSeats: string;
  setEditSeats: React.Dispatch<React.SetStateAction<string>>;
  editPrice: string;
  setEditPrice: React.Dispatch<React.SetStateAction<string>>;
  editRequiresPassengerKyc?: boolean;
  setEditRequiresPassengerKyc?: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
}

export function TripEditorDetailsFields(props: TripEditorDetailsProps) {
  const { disabled = false, trip } = props;
  const [showOptions, setShowOptions] = useState(false);
  return <>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Quand partez-vous ?</Text>
      <View style={s.schedule}>
        {(['date', 'time'] as const).map(mode => {
          const date = mode === 'date';
          const value = date ? props.formattedEditDate : props.formattedEditTime;
          return <TouchableOpacity key={mode} style={[s.date, !date && s.time]} disabled={disabled}
            accessibilityRole="button" accessibilityLabel={`${date ? 'Date' : 'Heure'} de départ : ${value}. Modifier`}
            accessibilityState={{ disabled }} onPress={() => { if (!disabled) props.openDateOrTimePicker(mode); }}>
            <Ionicons name={date ? 'calendar-outline' : 'time-outline'} size={20} color={ACTION_COLORS.orange} />
            <View style={s.grow}><Text style={s.label}>{date ? 'Date' : 'Heure'}</Text><Text style={s.value}>{value}</Text></View>
          </TouchableOpacity>;
        })}
      </View>
      {Platform.OS === 'ios' && props.iosPickerMode && <View style={s.picker} pointerEvents={disabled ? 'none' : 'auto'}>
        <DateTimePicker value={props.getEditBaseDate()} mode={props.iosPickerMode} display="inline" minuteInterval={5}
          minimumDate={props.iosPickerMode === 'date' ? new Date() : undefined}
          onChange={(event, date) => { if (!disabled) props.handleIosPickerChange(event, date); }} />
        <TouchableOpacity style={s.link} disabled={disabled} accessibilityRole="button" onPress={props.closeIosPicker}>
          <Text style={s.linkText}>Terminé</Text></TouchableOpacity>
      </View>}
    </View>
    <View style={s.figures}>
      <View style={s.figure}><Text style={s.label}>Places disponibles</Text>
        <TextInput style={s.amount} value={props.editSeats} onChangeText={props.setEditSeats} editable={!disabled}
          keyboardType="number-pad" accessibilityLabel="Places disponibles" placeholder="4" selectTextOnFocus />
      </View>
      <View style={s.figure}><Text style={s.label}>{trip?.tripRequestId ? 'Prix convenu' : 'Prix par place'}</Text>
        {trip?.tripRequestId ? <Text style={[s.value, { paddingVertical: 10 }]}
          accessibilityLabel="Prix du trajet validé par le passager, non modifiable">{requestTripPriceLabel(trip)}</Text> :
          <View style={s.row}><TextInput style={s.amount} value={props.editPrice} onChangeText={props.setEditPrice}
            editable={!disabled} keyboardType="numeric" accessibilityLabel="Prix par place en FC" placeholder="0" selectTextOnFocus />
            <Text style={s.currency}>FC</Text></View>}
      </View>
    </View>
    <TripEditorVehiclePicker vehicles={props.activeEditVehicles} loading={props.editVehiclesLoading}
      vehicleId={props.editVehicleId} onSelect={props.setEditVehicleId} disabled={disabled} />
    {props.setEditRequiresPassengerKyc && <View>
      <TouchableOpacity style={s.preference} disabled={disabled} accessibilityRole="button"
        accessibilityState={{ expanded: showOptions, disabled }} onPress={() => { if (!disabled) setShowOptions(value => !value); }}>
        <Ionicons name="options-outline" size={19} color={ACTION_COLORS.blue} />
        <View style={s.grow}><Text style={s.value}>Options du trajet</Text>
          {props.editRequiresPassengerKyc && <Text style={s.hint}>Passagers vérifiés uniquement</Text>}</View>
        <Ionicons name={showOptions ? 'chevron-up' : 'chevron-down'} size={16} color={ACTION_COLORS.blue} />
      </TouchableOpacity>
      {showOptions && <TouchableOpacity style={s.preference} disabled={disabled} accessibilityRole="switch"
        accessibilityState={{ checked: Boolean(props.editRequiresPassengerKyc), disabled }}
        accessibilityLabel="Passagers vérifiés uniquement" onPress={() => { if (!disabled) props.setEditRequiresPassengerKyc?.(value => !value); }}>
        <View style={s.grow}><Text style={s.value}>Passagers vérifiés uniquement</Text>
          <Text style={s.hint}>Identité vérifiée avant de réserver ou d’embarquer.</Text></View>
        <Ionicons name={props.editRequiresPassengerKyc ? 'checkbox' : 'square-outline'} size={25} color={ACTION_COLORS.orange} />
      </TouchableOpacity>}
    </View>}
  </>;
}
