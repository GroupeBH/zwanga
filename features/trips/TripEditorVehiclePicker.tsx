import { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Vehicle } from '@/types';
import { ACTION_COLORS } from '@/constants/actionColors';
import { tripEditorStyles as s } from './tripEditorStyles';

export function TripEditorVehiclePicker({ vehicles, loading, vehicleId, onSelect, disabled = false }: {
  vehicles: Vehicle[]; loading: boolean; vehicleId: string | null; onSelect: (id: string) => void; disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const selected = vehicles.find(vehicle => vehicle.id === vehicleId);
  const open = !selected || expanded;
  const name = (vehicle: Vehicle) => [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Véhicule';
  if (loading) return <View style={s.vehicle}><ActivityIndicator color={ACTION_COLORS.orange} />
    <Text style={s.hint}>Chargement des véhicules…</Text></View>;
  if (!vehicles.length) return <View style={s.vehicle}><Ionicons name="car-outline" size={22} color={ACTION_COLORS.blue} />
    <Text style={[s.hint, s.grow]}>Aucun véhicule actif. Ajoutez-en un dans votre profil.</Text></View>;
  return <View>
    <TouchableOpacity style={s.vehicle} accessibilityRole="button" disabled={disabled || vehicles.length === 1 && !!selected}
      accessibilityLabel={selected ? `Véhicule : ${name(selected)}${vehicles.length > 1 ? '. Changer' : ''}` : 'Choisir un véhicule'}
      accessibilityState={{ expanded: open, disabled: disabled || vehicles.length === 1 && !!selected }}
      onPress={() => { if (!disabled) setExpanded(value => !value); }}>
      <Ionicons name="car-outline" size={22} color={ACTION_COLORS.orange} />
      <View style={s.grow}><Text style={s.label}>Votre véhicule</Text>
        <Text style={s.value} numberOfLines={2}>{selected ? name(selected) : 'Choisir un véhicule'}</Text>
        {!!selected?.licensePlate && <Text style={s.hint}>{selected.licensePlate}</Text>}
      </View>
      {vehicles.length > 1 && <><Text style={s.linkText}>{open ? 'Fermer' : 'Changer'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={ACTION_COLORS.orange} /></>}
    </TouchableOpacity>
    {open && <View style={s.options} testID="trip-edit-vehicle-options">
      {vehicles.map(vehicle => <TouchableOpacity key={vehicle.id} style={[s.option, vehicle.id === vehicleId && s.selected]}
        accessibilityRole="radio" accessibilityLabel={`${name(vehicle)}, ${vehicle.licensePlate || ''}`}
        accessibilityState={{ checked: vehicle.id === vehicleId, disabled }} disabled={disabled}
        onPress={() => { if (!disabled) { onSelect(vehicle.id); setExpanded(false); } }}>
        <View style={s.grow}><Text style={s.value}>{name(vehicle)}</Text>
          <Text style={s.hint}>{[vehicle.color, vehicle.licensePlate].filter(Boolean).join(' · ')}</Text></View>
        <Ionicons name={vehicle.id === vehicleId ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={ACTION_COLORS.orange} />
      </TouchableOpacity>)}
    </View>}
  </View>;
}
