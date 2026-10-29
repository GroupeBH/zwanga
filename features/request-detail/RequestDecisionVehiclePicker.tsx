import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { Colors } from '@/constants/styles';

type Model = ReturnType<typeof useRequestDetailController>;

/** Keep the action area compact until the driver explicitly opens their vehicles. */
export function RequestDecisionVehiclePicker({ model, disabled }: { model: Model; disabled: boolean }) {
  const { height } = useWindowDimensions();
  const [expandedScope, setExpandedScope] = useState<string | null>(null);
  const scope = `${model.userId ?? ''}:${model.tripRequest?.id ?? ''}`;
  const vehicles = model.compatibleActiveVehicles;
  const selected = vehicles.find(vehicle => vehicle.id === model.directAcceptVehicleId);
  const expanded = expandedScope === scope;
  if (!vehicles.length) return null;

  if (vehicles.length === 1) return <View style={styles.single}>
    <Ionicons name="car-outline" size={22} color={Colors.primary} />
    <View style={styles.copy}><Text style={styles.hint}>Votre véhicule</Text>
      <Text style={styles.name}>{vehicles[0].brand} {vehicles[0].model} · {vehicles[0].licensePlate}</Text>
    </View>
  </View>;

  return <View style={styles.picker}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded, disabled }} disabled={disabled}
      accessibilityLabel={selected
        ? `Changer de véhicule. ${selected.brand} ${selected.model}, ${selected.licensePlate}`
        : 'Choisir mon véhicule pour accepter la demande'}
      accessibilityHint={expanded ? 'Replier la liste des véhicules.' : 'Afficher vos véhicules disponibles.'}
      onPress={() => { if (!disabled) setExpandedScope(expanded ? null : scope); }}
      style={({ pressed }) => [styles.current, !selected && styles.choose, pressed && !disabled && styles.pressed]}>
      <Ionicons name="car-outline" size={22} color={Colors.primaryDark} />
      <View style={styles.copy}>
        <Text style={styles.name}>{selected ? `${selected.brand} ${selected.model}` : 'Choisir mon véhicule'}</Text>
        <Text style={styles.hint}>{selected ? selected.licensePlate : 'Pour accepter la demande'}</Text>
      </View>
      {(expanded || selected) && <Text style={styles.change}>{expanded ? 'Fermer' : 'Changer'}</Text>}
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.primaryDark} />
    </Pressable>
    {expanded && <FlatList
      accessibilityLabel="Véhicules disponibles"
      data={vehicles}
      keyExtractor={vehicle => vehicle.id}
      style={{ maxHeight: Math.min(144, height * 0.2), flexGrow: 0 }}
      contentContainerStyle={styles.options}
      showsVerticalScrollIndicator
      initialNumToRender={3}
      maxToRenderPerBatch={4}
      windowSize={3}
      removeClippedSubviews={false}
      extraData={`${model.directAcceptVehicleId}:${disabled}`}
      renderItem={({ item: vehicle }) => {
        const checked = selected?.id === vehicle.id;
        return <Pressable accessibilityRole="radio" accessibilityState={{ checked, disabled }} disabled={disabled}
          accessibilityLabel={`${vehicle.brand} ${vehicle.model}, ${vehicle.licensePlate}`}
          onPress={() => {
            if (disabled) return;
            model.setDirectAcceptVehicleId(vehicle.id);
            setExpandedScope(null);
          }} style={({ pressed }) => [styles.option, checked && styles.selected, pressed && !disabled && styles.pressed]}>
          <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={22} color={Colors.primary} />
          <View style={styles.copy}><Text style={styles.name}>{vehicle.brand} {vehicle.model}</Text>
            <Text style={styles.hint}>{vehicle.licensePlate}</Text></View>
        </Pressable>;
      }}
    />}
  </View>;
}

const styles = StyleSheet.create({
  picker: { gap: 6 }, copy: { flex: 1, minWidth: 0, gap: 2 },
  single: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  hint: { fontSize: 12, color: Colors.gray[600] }, name: { fontSize: 14, fontWeight: '600', color: Colors.gray[900] },
  current: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12 },
  choose: { borderColor: Colors.primaryDark }, pressed: { opacity: 0.75 },
  change: { fontSize: 13, fontWeight: '700', color: Colors.primaryDark }, options: { gap: 6, paddingRight: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] },
  selected: { borderColor: Colors.primary, backgroundColor: '#FFF6F0' },
});
