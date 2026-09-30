import { Colors, Spacing } from '@/constants/styles';
import { getDriverJourneyPresentation } from '@/features/profile/driverJourneyPresentation';
import { styles } from '@/features/profile/ProfileDashboard.styles';
import type { ProfileState } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export function ProfileDriverJourney({ state, busy, onContinue }: {
  state: ProfileState; busy: boolean; onContinue: () => void;
}) {
  const view = getDriverJourneyPresentation(state);
  return (
    <View style={{ gap: Spacing.md }}>
      <View>
        <Text style={styles.profileOverviewTitle}>{view.title}</Text>
        <Text style={[styles.identityHint, { marginTop: Spacing.xs }]}>{view.message}</Text>
      </View>
      {view.showSteps && <View style={{ gap: Spacing.sm }}>
        {[
          { label: view.identityLabel, done: state.identity.status === 'approved' },
          { label: view.vehicleLabel, done: state.driver.activeVehicleCount > 0 },
        ].map(step => (
          <View key={step.label} style={styles.identityHeading}>
            <Ionicons name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={step.done ? Colors.successDark : Colors.gray[600]} />
            <Text style={styles.identityTitle}>{step.label}</Text>
          </View>
        ))}
      </View>}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={view.label}
        accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onContinue}
        style={[styles.profileOverviewCta, styles.becomeDriverButton, busy && styles.profileOverviewCtaDisabled]}>
        {busy ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.profileOverviewCtaText}>{view.label}</Text>}
      </TouchableOpacity>
    </View>
  );
}
