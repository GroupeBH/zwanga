import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { homeRequestStyles as s } from '@/features/trip-request/homeRequestStyles';
import { TRIP_PAYMENT_MODE_OPTIONS } from '@/features/trip-request/requestFormModel';
import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';
import { RequestBudgetFields } from './RequestBudgetFields';
import { RequestDriverPicker } from './RequestDriverPicker';

export function HomeRequestExtras({ form }: { form: RequestTripController }) {
  const [showOptions, setShowOptions] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const payment = TRIP_PAYMENT_MODE_OPTIONS.find(option => option.id === form.requestPaymentMode)?.label ?? 'Paiement à choisir';
  return <>
    <TouchableOpacity style={s.extrasToggle} accessibilityRole="button" accessibilityState={{ expanded: showOptions }}
      accessibilityLabel={`Modifier le paiement et les places : ${payment}, ${form.requestSeatsLabel}`}
      onPress={() => setShowOptions(value => !value)}>
      <Ionicons name="wallet-outline" size={20} color={Colors.gray[700]} />
      <Text style={[s.locationText, s.locationCopy]}>{payment} · {form.requestSeatsLabel}</Text>
      <Ionicons name={showOptions ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[600]} />
    </TouchableOpacity>
    {showOptions && <View style={s.extras}><RequestBudgetFields {...form} compact section="options" /></View>}
    <TouchableOpacity style={s.extrasToggle} accessibilityRole="button" accessibilityState={{ expanded: showExtras }}
      onPress={() => setShowExtras(value => !value)}>
      <Text style={[s.label, s.locationCopy]}>{form.targetDriver ? `Pour ${form.targetDriver.name} · Modifier`
        : form.departureReference || form.arrivalReference || form.description ? 'Précisions ajoutées · Modifier'
          : 'Ajouter une précision ou choisir un conducteur'}</Text>
      <Ionicons name={showExtras ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.gray[600]} />
    </TouchableOpacity>
    {showExtras && <View style={s.extras}>
      {([
        ['Repère au départ', form.departureReference, form.setDepartureReference, 'Ex. Devant la pharmacie'],
        ['Repère à l’arrivée', form.arrivalReference, form.setArrivalReference, 'Ex. Portail bleu'],
        ['Note pour le conducteur', form.description, form.setDescription, 'Ex. J’ai un bagage'],
      ] as const).map(([label, value, onChangeText, placeholder]) => <View key={label}>
        <Text style={s.label}>{label} · facultatif</Text>
        <TextInput style={s.input} accessibilityLabel={label} value={value} onChangeText={onChangeText}
          placeholder={placeholder} placeholderTextColor={Colors.gray[500]} maxLength={200} returnKeyType="done" />
      </View>)}
      <RequestDriverPicker departure={form.departureLocation} vehicleType={form.selectedVehicleType}
        vehicleTypes={form.selectedVehicleTypes} seats={form.hasSpecifiedNumberOfSeats ? form.numberOfSeats : 1}
        selected={form.targetDriver} onSelect={form.setTargetDriver} disabled={form.isCreating} />
    </View>}
  </>;
}
