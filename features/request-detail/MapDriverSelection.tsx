import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch } from '@/store/hooks';
import { useTargetRequestMapDriverMutation } from '@/store/api/requestDriverApi';
import { tripRequestApi } from '@/store/api/tripRequestApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { TripRequest } from '@/types';
import { searchVehicleAppearance, type RequestVehicleMarker } from './requestSearchModel';
import { mapDriverSelectionPayload } from './requestDriverChangePolicy';

export function MapDriverSelection({ request, vehicle, disabled, onClose }: {
  request: TripRequest; vehicle?: RequestVehicleMarker; disabled: boolean; onClose: () => void;
}) {
  const [send, { isLoading }] = useTargetRequestMapDriverMutation();
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const appearance = vehicle ? searchVehicleAppearance(vehicle) : null;
  const submit = async () => {
    if (!vehicle || disabled || busy.current) return;
    const payload = mapDriverSelectionPayload(request, vehicle.id);
    if (!payload) return;
    const version = getTokenSessionVersion();
    busy.current = true; setError(null);
    try {
      const updated = await send(payload).unwrap();
      if (!mounted.current || version !== getTokenSessionVersion()) return;
      await dispatch(tripRequestApi.util.upsertQueryData('getTripRequestById', updated.id, updated));
      if (mounted.current && version === getTokenSessionVersion()) onClose();
    } catch (cause) {
      if (mounted.current && version === getTokenSessionVersion()) setError(getApiErrorMessage(cause,
        'Envoi non confirmé. Actualisez la demande avant de réessayer.'));
    } finally { busy.current = false; }
  };
  return <View style={s.panel}>
    <View style={s.row}><Text style={s.title}>{appearance?.title ?? 'Conducteur indisponible'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Fermer le choix du conducteur" disabled={isLoading} onPress={onClose} style={s.close}>
        <Ionicons name="close" size={22} color="#283141" />
      </Pressable></View>
    <Text style={s.hint}>{appearance?.description ?? 'Les positions ont changé. Actualisez la carte.'}</Text>
    <Text style={s.hint}>Il aura 3 minutes pour répondre. En cas de refus ou sans réponse, la recherche reprendra automatiquement.</Text>
    <Pressable accessibilityRole="button" disabled={disabled || isLoading || !vehicle} onPress={() => { void submit(); }}
      style={[s.button, (disabled || isLoading || !vehicle) && s.disabled]}>
      {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Envoyer à ce conducteur</Text>}
    </Pressable>
    {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({
  panel: { gap: 6 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: '#283141', fontSize: 17, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#657080', fontSize: 12, lineHeight: 17 },
  button: { backgroundColor: '#CE4613', borderRadius: 25, minHeight: 48, alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 }, disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 18 },
});
