import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { useAppSelector } from '@/store/hooks';
import { styles } from '@/features/home/HomeTripsSheet.styles';

/** Reuse the presence coordinator's cache. A green badge never renews a server lease. */
export const HomeDriverStatus = React.memo(function HomeDriverStatus({ active, onPress }: {
  active: boolean; onPress: () => void;
}) {
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const { data, isError } = useDriverDispatchStatusQuery(undefined, { skip: !active || !online });
  const [, expire] = useState(0);
  const deadline = Date.parse(data?.presence?.expiresAt ?? '');
  useEffect(() => {
    if (!active || !Number.isFinite(deadline)) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => expire(value => value + 1), Math.min(remaining + 50, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [active, deadline]);
  const available = online && !isError && data?.enabled && data.available && deadline > Date.now();
  const label = available ? 'En ligne' : !online ? 'Hors ligne' : data && !isError ? 'Indisponible' : 'À vérifier';
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Alertes conducteur : ${label}`}
      onPress={onPress} activeOpacity={0.75} style={[styles.availability, available && styles.availabilityOnline]}>
      <View style={[styles.availabilityDot, available && styles.availabilityDotOnline]} />
      <Text style={[styles.availabilityText, available && styles.availabilityTextOnline]}>{label}</Text>
    </TouchableOpacity>
  );
});
