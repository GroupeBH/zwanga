import React, { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import type { Trip } from '@/types';

export function pickupDriverDetails(trip?: Trip | null) {
  const driver = trip?.driver;
  // Never display a different driver's identity, even with an inconsistent snapshot.
  if (driver?.id && trip?.driverId && driver.id !== trip.driverId) return { name: '', photo: '' };
  const name = [driver?.firstName?.trim(), driver?.lastName?.trim()].filter(Boolean).join(' ')
    || trip?.driverName?.trim() || '';
  // An explicit null means the current photo was removed; do not revive an old avatar.
  const photo = (driver?.profilePicture !== undefined ? driver.profilePicture : trip?.driverAvatar)?.trim() || '';
  return { name, photo: /^https?:\/\//i.test(photo) ? photo : '' };
}

/** One bounded native image; no polling, animation or additional profile request. */
export const PickupDriverDetails = memo(function PickupDriverDetails({ name, photo }: ReturnType<typeof pickupDriverDetails>) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = Boolean(photo && failedPhoto !== photo);
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={26} color={Colors.gray[500]} />
        {showPhoto ? <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover"
          resizeMethod="resize" fadeDuration={0} onError={() => setFailedPhoto(photo)}
          accessible accessibilityLabel={`Photo de ${name || 'votre conducteur'}`} /> : null}
      </View>
      <View style={styles.identity}>
        <Text style={styles.label}>VOTRE CONDUCTEUR</Text>
        <Text style={styles.name} numberOfLines={2}>{name || 'Conducteur du trajet'}</Text>
        {!showPhoto ? <Text style={styles.hint}>Photo non disponible</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: BorderRadius.md, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.gray[100] },
  photo: { ...StyleSheet.absoluteFillObject, width: 52, height: 52 },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: FontSizes.xs, color: Colors.gray[600], fontWeight: FontWeights.semibold, letterSpacing: 0.5 },
  name: { fontSize: FontSizes.base, color: Colors.gray[900], fontWeight: FontWeights.bold },
  hint: { fontSize: FontSizes.xs, color: Colors.gray[600] },
});
