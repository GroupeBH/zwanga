import { Colors, FontSizes, Spacing } from '@/constants/styles';
import { MAX_SEATS_WITHOUT_VERIFIED_IDENTITY } from '@/utils/passengerSeats';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  isIdentityVerified: boolean;
  capacity?: number | null;
  onVerify: () => void;
};

export const PassengerSeatNotice = React.memo(function PassengerSeatNotice({ isIdentityVerified, capacity, onVerify }: Props) {
  if (isIdentityVerified || (capacity != null && capacity <= MAX_SEATS_WITHOUT_VERIFIED_IDENTITY)) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Dès 3 places, votre identité doit être vérifiée. Aucun véhicule requis.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onVerify} style={styles.action} activeOpacity={0.8}>
        <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
        <Text style={styles.label}>Vérifier mon identité</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginVertical: Spacing.sm, gap: 2 },
  hint: { color: Colors.gray[600], fontSize: FontSizes.xs, lineHeight: 18 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: '600', flexShrink: 1 },
});
