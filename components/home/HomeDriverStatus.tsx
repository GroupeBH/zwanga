import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { useAppSelector } from '@/store/hooks';
import { homeDriverStatusView } from '@/features/home/homeDriverStatus';
import { HOME_DASHBOARD_COLORS } from '@/features/home/homeDashboardTheme';
import { styles } from '@/features/home/HomeHeader.styles';

/** Reads the presence coordinator's shared cache: no extra polling, lease or permission request. */
export const HomeDriverStatus = React.memo(function HomeDriverStatus({ active, onPress }: {
  active: boolean; onPress: () => void;
}) {
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const { data, isError } = useDriverDispatchStatusQuery(undefined, { skip: !active || !online });
  const [now, setNow] = useState(() => Date.now());
  // Keeps "il y a N min" truthful while Home is visible; stopped in background.
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [active, data]);
  const view = homeDriverStatusView({ online, data, isError, now });
  if (!view) return null;
  const tone = view.tone === 'ok' ? styles.driverStatusOk : view.tone === 'warn' ? styles.driverStatusWarn : styles.driverStatusOff;
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.8}
      accessibilityLabel={`Alertes conducteur : ${view.title}${view.detail ? `, ${view.detail}` : ''}`}
      accessibilityHint="Ouvrir les réglages des alertes conducteur."
      onPress={onPress} style={styles.driverStatus}>
      <View style={[styles.driverStatusDot, tone]} />
      <View style={styles.driverStatusCopy}>
        <Text style={[styles.driverStatusTitle, view.tone === 'ok' && styles.driverStatusTitleOk]}>{view.title}</Text>
        {view.detail ? <Text style={styles.driverStatusDetail}>{view.detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={HOME_DASHBOARD_COLORS.muted} accessible={false} />
    </TouchableOpacity>
  );
});
