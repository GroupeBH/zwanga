import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styles, ALERT_SETTINGS_INK } from '@/features/notifications/driverAlertSettings.styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useDriverDispatchStatusQuery } from '@/store/api/driverDispatchApi';
import { NearbyDriverLocationPermission } from '@/components/profile/NearbyDriverLocationPermission';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { openDriverAlertSettings } from '@/services/driverAlertChannel';
import { DriverFullScreenPreference } from '@/components/profile/DriverFullScreenPreference';

export default function DriverAvailabilityScreen() {
  const router = useRouter();
  const active = useScreenIsActive();
  const enabled = useDisplayReadsEnabled(active);
  const [expanded, setExpanded] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const { data, isError, isLoading, isFetching, refetch } = useDriverDispatchStatusQuery(undefined, displayReadOptions(enabled));
  const available = Boolean(enabled && data?.enabled && data.automatic && !isError);
  const retryDisabled = !enabled || isFetching;
  const openSettings = async () => {
    if (!active) return;
    setSettingsError(false);
    try { await openDriverAlertSettings(); }
    catch { setSettingsError(true); }
  };
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" style={styles.back}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
        <Ionicons name="arrow-back" size={24} color={ALERT_SETTINGS_INK} />
      </TouchableOpacity>
      <Text maxFontSizeMultiplier={1.3} style={styles.title}>Localisation et alertes</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>Votre position sert à vous proposer les commandes proches.</Text>
      <View style={styles.summary}>
        <Ionicons name="location-outline" size={24} color={ALERT_SETTINGS_INK} accessible={false} />
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>Réception des commandes</Text>
          <Text accessibilityLiveRegion="polite" style={styles.copy}>{!enabled ? 'Connexion nécessaire pour vérifier le service.'
            : isLoading ? 'Vérification…' : isError ? 'Vérification impossible. Réessayez.'
            : !available ? 'Service momentanément indisponible.'
            : data?.needsLocationRefresh ? 'Actualisez votre position pour recevoir les commandes proches.'
            : data?.available === false ? 'Réception à vérifier : position ou véhicule.'
            : 'Automatique selon votre position et votre véhicule.'}</Text>
        </View>
        {isLoading && enabled ? <ActivityIndicator color={ALERT_SETTINGS_INK} /> : null}
      </View>
      {isError && <TouchableOpacity accessibilityRole="button" disabled={retryDisabled}
        accessibilityState={{ disabled: retryDisabled, busy: isFetching }} style={styles.retry}
        onPress={() => { if (!retryDisabled) void refetch(); }}>
        <Text style={styles.link}>{isFetching ? 'Vérification…' : 'Réessayer'}</Text>
      </TouchableOpacity>}
      <View style={styles.section}><NearbyDriverLocationPermission available={available} /></View>
      <View style={styles.section}>
        <TouchableOpacity accessibilityRole="button" style={styles.settingsRow} disabled={!active}
          onPress={() => { void openSettings(); }} accessibilityLabel="Régler le son et les notifications">
          <View style={styles.rowIcon}><Ionicons name="notifications-outline" size={22} color={ALERT_SETTINGS_INK} /></View>
          <View style={styles.summaryCopy}>
            <Text style={styles.label}>Son et notifications</Text>
            <Text style={styles.copy}>Gérer dans les réglages du téléphone</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={ALERT_SETTINGS_INK} accessible={false} />
        </TouchableOpacity>
        {settingsError && <Text accessibilityRole="alert" style={styles.copy}>Impossible d’ouvrir les réglages. Réessayez ou ouvrez-les depuis votre téléphone.</Text>}
        <DriverFullScreenPreference />
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} style={styles.more}
        onPress={() => setExpanded(value => !value)}>
        <Text style={styles.label}>Comprendre les alertes</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={ALERT_SETTINGS_INK} />
      </TouchableOpacity>
      {expanded && <View style={styles.details}>
        <Text style={styles.copy}>Les alertes se préparent dès la connexion, après votre autorisation de notifications. Aucune disponibilité à activer : les commandes sont proposées selon votre position et votre véhicule.</Text>
        <Text style={styles.copy}>{data?.alertLocationMaxAgeSeconds
          ? `Votre dernière position reste disponible pour la recherche. Pour recevoir les nouvelles alertes, elle doit dater de moins de ${Math.round(data.alertLocationMaxAgeSeconds / 3600)} heures. Autorisez la localisation et ouvrez l’app pour l’actualiser.`
          : data?.locationPolicy === 'last_known' && data.positionExpires === false
          ? 'Hors trajet, votre dernière position connue peut être utilisée même si elle est ancienne. Elle ne reflète pas forcément votre emplacement actuel. Un arrêt forcé de l’app peut interrompre son actualisation.'
          : `Une position trop ancienne n’est plus utilisée : elle reste valable au maximum ${Math.round((data?.positionFreshSeconds ?? 300) / 60)} minute(s). Un arrêt forcé de l’app peut interrompre la localisation.`}</Text>
        <Text style={styles.copy}>Le mode silencieux, « Ne pas déranger » et les restrictions du téléphone peuvent limiter les alertes.</Text>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
