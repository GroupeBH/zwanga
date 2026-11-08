import { Colors } from '@/constants/styles';
import { getRegisteredVehicleTypeLabel } from '@/constants/vehicleTypes';
import type { Vehicle } from '@/types';
import Animated, { type FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PublishVehicleStepProps {
  stepEntering: FadeInDown | undefined;
  activeVehicles: Vehicle[];
  selectedVehicleId: string | null;
  vehicleCreationMessage: string | null;
  isLoadingVehicles: boolean;
  openVehicleForm: () => void;
  setSelectedVehicleId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function PublishVehicleStep(props: PublishVehicleStepProps) {
  const [expanded, setExpanded] = useState(false);
  const selected = props.activeVehicles.find(vehicle => vehicle.id === props.selectedVehicleId);
  const loading = props.isLoadingVehicles && !props.activeVehicles.length;
  const name = (vehicle: Vehicle) => `${vehicle.brand} ${vehicle.model}`.trim() || 'Véhicule';
  return <Animated.View entering={props.stepEntering} style={s.section}>
    <Text style={s.title}>Votre véhicule</Text>
    {loading ? <View style={s.loading}><ActivityIndicator color={Colors.primary} /><Text style={s.hint}>Chargement des véhicules…</Text></View>
      : !props.activeVehicles.length ? <TouchableOpacity style={s.current} accessibilityRole="button" onPress={props.openVehicleForm}>
        <Ionicons name="add-circle-outline" size={22} color={Colors.primary} /><Text style={s.link}>Ajouter mon véhicule</Text>
      </TouchableOpacity> : <>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }}
          accessibilityLabel={selected ? `${name(selected)}, ${selected.licensePlate}. Changer de véhicule` : 'Choisir mon véhicule'}
          style={s.current} onPress={() => setExpanded(value => !value)}>
          <Ionicons name={selected?.type === 'motorcycle_2_wheels' ? 'bicycle-outline' : 'car-outline'} size={22} color={Colors.primary} />
          <View style={s.copy}>
            <Text style={s.name}>{selected ? name(selected) : 'Choisir mon véhicule'}</Text>
            {selected && <Text style={s.hint}>{selected.licensePlate} · {getRegisteredVehicleTypeLabel(selected.type)}</Text>}
          </View>
          <Text style={s.link}>{expanded ? 'Fermer' : 'Changer'}</Text>
        </TouchableOpacity>
        {expanded && <View>
          <ScrollView nestedScrollEnabled style={s.list} contentContainerStyle={s.options} keyboardShouldPersistTaps="handled">
            {props.activeVehicles.map(vehicle => <TouchableOpacity key={vehicle.id} accessibilityRole="radio"
              accessibilityLabel={`${name(vehicle)}, ${vehicle.licensePlate}`}
              accessibilityState={{ checked: vehicle.id === selected?.id }}
              style={[s.option, vehicle.id === selected?.id && s.selected]}
              onPress={() => { props.setSelectedVehicleId(vehicle.id); setExpanded(false); }}>
              <Ionicons name={vehicle.id === selected?.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={Colors.primary} />
              <View style={s.copy}><Text style={s.name}>{name(vehicle)}</Text>
                <Text style={s.hint}>{vehicle.licensePlate} · {getRegisteredVehicleTypeLabel(vehicle.type)}</Text></View>
            </TouchableOpacity>)}
          </ScrollView>
          <TouchableOpacity style={s.add} accessibilityRole="button" onPress={props.openVehicleForm}>
            <Text style={s.link}>+ Ajouter un véhicule</Text>
          </TouchableOpacity>
        </View>}
      </>}
    {!!props.vehicleCreationMessage && <Text style={s.hint} accessibilityLiveRegion="polite">{props.vehicleCreationMessage}</Text>}
  </Animated.View>;
}
const s = StyleSheet.create({
  section: { gap: 6, marginBottom: 10 }, title: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  current: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, padding: 10,
    borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 12, backgroundColor: Colors.white },
  copy: { flex: 1, minWidth: 0, gap: 2 }, name: { fontSize: 14, fontWeight: '600', color: Colors.gray[900] },
  hint: { fontSize: 12, lineHeight: 18, color: Colors.gray[600] },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primaryDark },
  list: { maxHeight: 176 }, options: { gap: 6, paddingVertical: 6 },
  option: { minHeight: 56, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[300], backgroundColor: Colors.white },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF3EC' },
  add: { minHeight: 44, justifyContent: 'center' }, loading: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
