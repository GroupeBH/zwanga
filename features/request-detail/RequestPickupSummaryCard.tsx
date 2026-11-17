import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useAppSelector } from '@/store/hooks';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { useGetRequestPickupSummaryQuery } from '@/store/api/requestPickupApi';
import { pickupMapUrl, pickupSummaryPresentation } from './requestPickupSummary';
import { requestSummaryStyles as s } from './requestSummaryStyles';

/** Shared by the acceptance overlays and both request detail screens. No additional GPS watcher. */
export function RequestPickupSummaryCard({ requestId, active }: { requestId: string; active: boolean }) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const enabled = useDisplayReadsEnabled(active && !!userId && !!requestId);
  const query = useGetRequestPickupSummaryQuery(requestId, displayReadOptions(enabled, 30_000));
  const [now, setNow] = useState(Date.now);
  const [mapError, setMapError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [enabled, requestId, query.fulfilledTimeStamp]);
  const data = enabled && !query.isError ? query.currentData : undefined;
  const model = pickupSummaryPresentation(data, requestId, userId, Math.max(now, Date.now()));
  const openMap = (url: string | null) => { if (url) { setMapError(false); void Linking.openURL(url).catch(() => setMapError(true)); } };
  if (!active) return null;
  if (!model || !data) return <View style={s.card}><Text style={s.name}>Prise en charge</Text>
    <Text style={s.muted}>{!enabled ? 'Reconnectez-vous pour voir la prise en charge.' : query.isFetching ? 'Actualisation de la prise en charge…' : 'Prise en charge indisponible. Actualisez la commande.'}</Text></View>;
  const pickupUrl = pickupMapUrl(data.pickup.coordinates), personUrl = pickupMapUrl(model.person.position);
  return <View style={s.card} accessibilityLiveRegion={'polite'}>
    <Text style={s.label}>{data.viewerRole === 'driver' ? 'VOTRE PASSAGER' : 'VOTRE CONDUCTEUR'}</Text>
    <Text style={s.name}>{model.person.name}</Text>
    {model.vehicle && <Text style={s.muted}>{model.vehicle}</Text>}
    <Text style={s.name}>{model.message}</Text>
    <Text style={s.muted}>Point de récupération : {data.pickup.location}{data.pickup.reference ? ` · ${data.pickup.reference}` : ''}</Text>
    <Text style={s.muted}>Temps d’approche estimé, hors arrêts éventuels. Ce n’est pas une confirmation de départ.</Text>
    {pickupUrl && <Pressable accessibilityRole={'button'} style={s.secondary} onPress={() => openMap(pickupUrl)}><Text style={s.secondaryText}>Voir le point de récupération</Text></Pressable>}
    {personUrl && <Pressable accessibilityRole={'button'} style={s.secondary} onPress={() => openMap(personUrl)}><Text style={s.secondaryText}>Voir sa position récente</Text></Pressable>}
    {mapError && <Text style={s.muted}>Impossible d’ouvrir la carte.</Text>}
  </View>;
}
