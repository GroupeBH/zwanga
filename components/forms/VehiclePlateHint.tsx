import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Colors, FontSizes } from '@/constants/styles';
import { isValidVehiclePlate, VEHICLE_PLATE_FORMAT_MESSAGE } from '@/utils/vehiclePlate';

export function VehiclePlateHint({ value }: { value: string }) {
  const invalid = Boolean(value.trim()) && !isValidVehiclePlate(value);
  return (
    <Text accessibilityLiveRegion="polite" style={[styles.hint, invalid && styles.error]}>
      {VEHICLE_PLATE_FORMAT_MESSAGE}
    </Text>
  );
}

const styles = StyleSheet.create({
  hint: { color: Colors.gray[600], fontSize: FontSizes.xs, lineHeight: 17, marginTop: 4 },
  error: { color: Colors.danger },
});
