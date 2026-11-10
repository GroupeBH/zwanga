import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import { ACTION_COLORS } from '@/constants/actionColors';
import { Colors } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import { toggleRequestVehicleType } from '@/features/trip-request/vehicleSelection';
import { requestVehicleEstimate } from '@/features/trip-request/vehicleEstimate';
import { homeRequestStyles as s } from '@/features/trip-request/homeRequestStyles';
import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';
import { getPassengerVehicleSeatCapacity } from '@/utils/passengerSeats';
import { RequestScheduleFields } from './RequestScheduleFields';

export function HomeRequestChoices({ form }: { form: RequestTripController }) {
  return <>
    <View style={s.row}>
      <TouchableOpacity style={[s.timing, form.timePreset === 'now' && s.selected]}
        onPress={() => form.applyPreset('now')} accessibilityRole="radio"
        accessibilityState={{ checked: form.timePreset === 'now' }} accessibilityLabel="Partir maintenant">
        <Ionicons name="flash-outline" size={17} color={ACTION_COLORS.orange} /><Text style={s.choiceText}>Maintenant</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.timing, form.timePreset === 'custom' && s.selected]}
        onPress={() => {
          if (form.timePreset === 'custom') return;
          form.applyPreset('custom');
          form.setHasChosenDepartureTime(false);
        }} accessibilityRole="radio" accessibilityState={{ checked: form.timePreset === 'custom' }} accessibilityLabel="Choisir un autre jour ou une autre heure">
        <Ionicons name="calendar-outline" size={17} color={ACTION_COLORS.orange} /><Text style={s.choiceText}>Plus tard</Text>
      </TouchableOpacity>
    </View>
    {form.timePreset === 'custom' && <RequestScheduleFields {...form} />}
    <View>
      <Text style={s.sectionTitle}>Votre véhicule</Text>
      <Text style={s.label}>Un ou plusieurs types au choix</Text>
    </View>
    <View style={s.row}>
      {REGISTERED_VEHICLE_TYPE_OPTIONS.map(option => {
        const selected = form.selectedVehicleTypes.includes(option.id);
        const capacity = getPassengerVehicleSeatCapacity(option.id);
        const disabled = !selected && capacity !== null && form.numberOfSeats > capacity;
        const label = option.id === 'car' ? 'Voiture' : option.id === 'motorcycle_2_wheels' ? 'Moto 2 roues' : 'Moto 3 roues';
        const estimate = requestVehicleEstimate(option.id, form);
        return <TouchableOpacity key={option.id} style={[s.vehicle, selected && s.selected, disabled && s.disabled]}
          onPress={() => form.setSelectedVehicleTypes(current => toggleRequestVehicleType(current, option.id))}
          accessibilityRole="checkbox" accessibilityLabel={`${option.label}, estimation pour le trajet : ${estimate}`} accessibilityState={{ checked: selected, disabled }}
          accessibilityHint={disabled ? 'Pas assez de places.' : selected && form.selectedVehicleTypes.length === 1
            ? 'Gardez au moins un type de véhicule.' : 'Ajoutez ou retirez ce type de véhicule.'} disabled={disabled}>
          <Ionicons name={option.icon} size={24} color={selected ? ACTION_COLORS.orange : Colors.gray[700]} />
          <Text style={[s.choiceText, selected && s.selectedText]}>{label}</Text>
          <View style={s.vehicleEstimate}>
            <Text style={s.vehicleEstimateLabel}>Estimation</Text>
            <Text style={s.vehicleEstimatePrice}>{estimate}</Text>
          </View>
        </TouchableOpacity>;
      })}
    </View>
  </>;
}
