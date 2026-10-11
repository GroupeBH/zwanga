import type { PublishStep } from './publishModel';
import { Colors, Spacing } from '@/constants/styles';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

const steps: { id: PublishStep; label: string }[] = [
  { id: 'route', label: 'Départ et arrivée' },
  { id: 'datetime', label: 'Date et heure' },
  { id: 'vehicle', label: 'Véhicule' },
  { id: 'pricing', label: 'Places et prix' },
  { id: 'confirm', label: 'Vérifier le trajet' },
];

interface Props {
  isStepActive: (step: PublishStep) => boolean;
  isStepCompleted: (step: PublishStep) => boolean;
}

export function PublishStepIndicator({ isStepActive, isStepCompleted }: Props) {
  const index = Math.max(0, steps.findIndex(step => isStepActive(step.id)));
  const label = `${index + 1} sur ${steps.length} · ${steps[index].label}`;
  return <View style={styles.container} accessible accessibilityRole="progressbar"
    accessibilityLabel="Publication du trajet"
    accessibilityValue={{ min: 1, max: steps.length, now: index + 1, text: label }}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.track}>
      {steps.map(step => <View key={step.id} style={[styles.segment,
        isStepCompleted(step.id) && styles.completed, isStepActive(step.id) && styles.active]} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.lg, paddingTop: 4, paddingBottom: 10, gap: 8 },
  label: { fontSize: 13, color: Colors.gray[700], fontWeight: '600' },
  track: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.gray[200] },
  completed: { backgroundColor: Colors.success },
  active: { backgroundColor: Colors.primary },
});
