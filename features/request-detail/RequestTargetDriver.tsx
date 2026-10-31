import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useOpenRequestToNearbyDriversMutation } from '@/store/api/requestDriverApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { TripRequest } from '@/types';
import { requestSummaryStyles as s } from './requestSummaryStyles';

/** Audience changes only after a deliberate passenger action and server confirmation. */
export function RequestTargetDriver({ request, disabled }: { request: TripRequest; disabled?: boolean }) {
  const [openSearch, { isLoading }] = useOpenRequestToNearbyDriversMutation();
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const scope = useRef({ mounted: true, version: getTokenSessionVersion() });
  useEffect(() => { const current = scope.current; current.mounted = true; return () => { current.mounted = false; }; }, []);
  if (!request.targetDriverId || request.selectedDriverId || request.tripId ||
    !['pending', 'offers_received'].includes(request.status)) return null;
  const broaden = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setError(null);
    try { await openSearch(request.id).unwrap(); }
    catch (cause) {
      if (scope.current.mounted && scope.current.version === getTokenSessionVersion())
        setError(getApiErrorMessage(cause, 'Envoi non confirmé. Réessayez : votre commande sera conservée.'));
    } finally { inFlight.current = false; }
  };
  return <View style={s.card}>
    <View style={local.heading}>
      <Ionicons name="person-outline" size={22} color="#CE4613" />
      <Text style={[s.name, local.title]}>{request.targetDriverName || 'Conducteur choisi'}</Text>
    </View>
    <Text style={s.muted}>{request.targetDriverDeclined
      ? 'Ce conducteur a refusé. Vous pouvez chercher un autre conducteur à proximité.'
      : request.targetDriverPriorityUntil ? 'Ce conducteur a la priorité pendant 3 minutes au maximum. En cas de refus ou sans réponse, nous chercherons un autre conducteur.'
      : 'Votre demande a été envoyée uniquement à ce conducteur. Vous attendez sa réponse.'}</Text>
    <Pressable accessibilityRole="button" disabled={isLoading || disabled} onPress={() => { void broaden(); }}
      style={[local.button, (isLoading || disabled) && s.disabled]}>
      {isLoading ? <ActivityIndicator color="#B83D0D" /> : <Text style={local.buttonText}>{request.targetDriverPriorityUntil ? 'Chercher un autre maintenant' : 'Envoyer aux conducteurs proches'}</Text>}
    </Pressable>
    {!!error && <Text accessibilityLiveRegion="polite" style={local.error}>{error}</Text>}
  </View>;
}

const local = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { flex: 1 },
  button: { borderColor: '#CE4613', borderWidth: 1, borderRadius: 24, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#B83D0D', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19 },
});
