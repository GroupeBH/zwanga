import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, FontWeights, Spacing, BorderRadius } from '@/constants/styles';
import type { Trip } from '@/types';
import { pickupVehicleDetails } from './pickupAwareness';
import { PickupDriverDetails, pickupDriverDetails } from './PickupDriverDetails';

/** Reuses the assigned trip: no extra profile query, polling or native modal. */
export function PickupVehicleDetails({ trip }: { trip?: Trip | null }) {
  const { name, color, plate } = pickupVehicleDetails(trip);
  if (!name && !color && !plate) {
    return (
      <View style={styles.container}>
        <PickupDriverDetails {...pickupDriverDetails(trip)} />
        <Text style={styles.hint}>Demandez au conducteur de confirmer son véhicule et sa plaque avant de monter.</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <PickupDriverDetails {...pickupDriverDetails(trip)} />
      <View style={styles.vehicleRow}>
        <Ionicons name={trip?.vehicle?.type?.startsWith('motorcycle_') ? 'bicycle-outline' : 'car-outline'} size={26} color={Colors.gray[700]} />
        <View style={styles.identity}>
          <Text style={styles.name}>{name || 'Véhicule du trajet'}</Text>
          {color ? <Text style={styles.color}>Couleur : {color}</Text> : null}
        </View>
      </View>
      {plate ? (
        <View style={styles.plateRow}>
          <Text style={styles.label}>PLAQUE</Text>
          <Text style={styles.plate} accessibilityLabel={`Plaque d’immatriculation : ${plate}`}>{plate}</Text>
        </View>
      ) : null}
      <Text style={styles.hint}>
        {!plate ? 'Confirmez la plaque avec le conducteur avant de monter.'
          : !name || !color ? 'Confirmez les informations manquantes avec le conducteur.'
            : 'Vérifiez la plaque avant de monter.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: Spacing.md, gap: Spacing.sm },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: FontSizes.base, fontWeight: FontWeights.bold, color: Colors.gray[900] },
  color: { fontSize: FontSizes.sm, color: Colors.gray[600] },
  plateRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm,
    backgroundColor: Colors.gray[100], borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  label: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, color: Colors.gray[600], letterSpacing: 0.8 },
  plate: { flexShrink: 1, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, letterSpacing: 1, color: Colors.gray[900] },
  hint: { fontSize: FontSizes.xs, lineHeight: 18, color: Colors.gray[600] },
});
