import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppSelector } from '@/store/hooks';
import type { User } from '@/types';
import { profileRequestDriver, routeUuid } from '@/features/trip-request/directDriverRequest';
import { MapDriverSelection } from '@/features/request-detail/MapDriverSelection';
import { useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';

export function DriverProfileRequestAction({ driver, active, requestId, markerId, sourceTripId, preferredType }: {
  driver: User; active: boolean; requestId?: string; markerId?: string; sourceTripId?: string; preferredType?: unknown;
}) {
  const router = useRouter();
  const userId = useAppSelector(state => state.auth.user?.id);
  const enabled = useDisplayReadsEnabled(active);
  const request = useGetTripRequestByIdQuery(requestId ?? '', displayReadOptions(enabled && !!requestId, 15000));
  const opening = useRef(false);
  useEffect(() => { if (active) opening.current = false; }, [active]);
  const choice = profileRequestDriver(driver, userId, preferredType);
  if (requestId) return <View style={s.section}>
    {request.currentData && request.currentData.passengerId === userId && markerId ? <MapDriverSelection request={request.currentData} markerId={markerId}
      disabled={!enabled || request.isError || request.isFetching} onClose={() => router.replace(getTripRequestDetailHref(requestId))} /> :
      <Text style={s.hint}>{request.isError ? 'Impossible de vérifier votre demande. Revenez à la carte et réessayez.' : 'Vérification de votre demande…'}</Text>}
  </View>;
  if (!choice) return null;
  return <View style={s.section}>
    <Text style={s.hint}>Demandez-lui un trajet à l’heure et vers la destination de votre choix. Sa disponibilité reste à confirmer.</Text>
    <Pressable accessibilityRole="button" disabled={!active} style={s.button} onPress={() => {
      if (!active || opening.current) return;
      opening.current = true;
      router.push({ pathname: '/request', params: { targetDriverId: choice.id, targetVehicleType: choice.vehicleType } });
    }}><Text style={s.buttonText}>Demander un trajet à ce conducteur</Text></Pressable>
    {!!routeUuid(sourceTripId) && <Pressable accessibilityRole="button" style={s.link}
      onPress={() => { if (active) router.push({ pathname: '/trip/[id]', params: { id: sourceTripId! } }); }}>
      <Text style={s.linkText}>Voir le trajet publié et réserver une place</Text>
    </Pressable>}
  </View>;
}
const s = StyleSheet.create({ section: { paddingHorizontal: 20, paddingBottom: 16, gap: 12 },
  hint: { fontSize: 13, lineHeight: 19, color: '#536071' }, button: { backgroundColor: '#CE4613', minHeight: 50,
    borderRadius: 25, alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  link: { minHeight: 44, justifyContent: 'center' }, linkText: { color: '#BA3E0F', fontWeight: '600', textAlign: 'center' } });
