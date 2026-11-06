import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { useAppSelector } from '@/store/hooks';
import { homeDriverStatusView } from '@/features/home/homeDriverStatus';
import { HOME_DASHBOARD_COLORS } from '@/features/home/homeDashboardTheme';
import { styles } from '@/features/home/HomeHeader.styles';
import { useDriverPositionRefresh } from '@/hooks/home/useDriverPositionRefresh';

/** Shared status cache, plus an explicit one-shot refresh for stale positions. No extra polling or lease. */
export const HomeDriverStatus = React.memo(function HomeDriverStatus({ active, onPress }: {
  active: boolean; onPress: () => void;
}) {
  const online = useAppSelector(state => state.zwangaApi.config.online);
  const userId = useAppSelector(state => state.auth.logoutRequestId ? undefined : state.auth.user?.id);
  const refresh = useDriverPositionRefresh({ userId, active, online });
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
  // A concurrent automatic acknowledgement supersedes an earlier retry message.
  const feedback = online && active && (view.action === 'refresh' || refresh.result === 'sent') ? refresh.feedback : null;
  const title = refresh.busy ? 'Envoi de votre position…' : feedback?.title ?? view.title;
  const detail = refresh.busy ? 'Patientez un instant.' : feedback?.detail ?? view.detail;
  const canRefresh = view.action === 'refresh' && !feedback?.settings;
  const disabled = refresh.busy || !active;
  const tone = view.tone === 'ok' ? styles.driverStatusOk : view.tone === 'warn' ? styles.driverStatusWarn : styles.driverStatusOff;
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.8}
      accessibilityLabel={`Alertes conducteur : ${title}${detail ? `, ${detail}` : ''}`}
      accessibilityHint={canRefresh ? 'Envoyer votre position actuelle pour les commandes proches.' : 'Ouvrir les réglages des alertes conducteur.'}
      accessibilityState={{ disabled, busy: refresh.busy }} disabled={disabled}
      onPress={canRefresh ? refresh.refresh : onPress} style={styles.driverStatus}>
      <View style={[styles.driverStatusDot, tone]} />
      <View style={styles.driverStatusCopy}>
        <Text accessibilityLiveRegion="polite" style={[styles.driverStatusTitle, view.tone === 'ok' && styles.driverStatusTitleOk]}>{title}</Text>
        {detail ? <Text style={styles.driverStatusDetail}>{detail}</Text> : null}
      </View>
      {refresh.busy ? <ActivityIndicator size="small" color={HOME_DASHBOARD_COLORS.muted} /> :
        <Ionicons name={canRefresh ? 'refresh-outline' : 'chevron-forward'} size={16} color={HOME_DASHBOARD_COLORS.muted} accessible={false} />}
    </TouchableOpacity>
  );
});
