import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useChangeRequestDriverMutation } from '@/store/api/requestDriverApi';
import { tripRequestApi, useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking, Trip, TripRequest } from '@/types';
import { canChangeRequestDriver } from './requestDriverChangePolicy';
import { requestDriverWaitDeadline } from './requestDriverWait';
import { useRequestDriverWait } from '@/hooks/request-detail/useRequestDriverWait';

export function ChangeRequestDriverButton({ request, booking, trip, disabled: suspended, onChanged, onPendingChange, compact = false }: {
  request?: TripRequest; booking?: Booking; trip?: Trip; disabled?: boolean; onChanged?: (requestId: string) => void;
  onPendingChange?: (pending: boolean) => void;
  compact?: boolean;
}) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const disabled = !useDisplayReadsEnabled(!suspended);
  const dispatch = useAppDispatch(), router = useRouter();
  const { showDialog } = useDialog();
  const [change, { isLoading }] = useChangeRequestDriverMutation();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false), mounted = useRef(true);
  const latest = useRef({ request, booking, trip, disabled, userId });
  latest.current = { request, booking, trip, disabled, userId };
  const waited = useRequestDriverWait(requestDriverWaitDeadline(request, userId, booking, trip), !disabled);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!canChangeRequestDriver(request, userId, booking, trip)) return null;
  const confirm = () => {
    if (disabled || busy.current) return;
    const selection = request!, version = getTokenSessionVersion();
    showDialog({ title: 'Changer de conducteur ?',
      message: 'Votre commande est conservée. Ce conducteur ne vous sera plus affecté et la recherche d’un autre conducteur reprendra.',
      variant: 'warning', actions: [
        { label: 'Garder ce conducteur', variant: 'secondary' },
        { label: 'Chercher un autre', onPress: async () => {
          const current = latest.current;
          if (busy.current || !mounted.current || current.disabled || version !== getTokenSessionVersion() ||
              !canChangeRequestDriver(current.request, current.userId, current.booking, current.trip) ||
              current.request?.id !== selection.id || current.userId !== userId ||
              current.request?.selectedAt !== selection.selectedAt || current.request?.selectedDriverId !== selection.selectedDriverId) return;
          busy.current = true; setError(null); onPendingChange?.(true);
          try {
            const updated = await change({ id: selection.id, selectedDriverId: selection.selectedDriverId!, selectedAt: selection.selectedAt! }).unwrap();
            if (!mounted.current || version !== getTokenSessionVersion() || latest.current.request?.id !== selection.id ||
                latest.current.userId !== userId) return;
            await dispatch(tripRequestApi.util.upsertQueryData('getTripRequestById', updated.id, updated));
            if (mounted.current && version === getTokenSessionVersion() && latest.current.request?.id === selection.id) {
              if (onChanged) onChanged(updated.id);
              else router.replace({ pathname: '/request/[id]', params: { id: updated.id } });
              // Do not unmount the pickup action through a booking refetch before navigation.
              dispatch(tripRequestApi.util.invalidateTags(['Booking', 'Trip']));
            }
          } catch (cause) {
            if (mounted.current && version === getTokenSessionVersion() && latest.current.request?.id === selection.id) setError(getApiErrorMessage(cause,
              'Changement non confirmé. Actualisez avant de réessayer ; votre commande est conservée.'));
          } finally {
            busy.current = false;
            if (mounted.current && version === getTokenSessionVersion()) onPendingChange?.(false);
          }
        } },
      ] });
  };
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityLabel="Changer de conducteur"
      accessibilityHint="Relancer la recherche en conservant votre commande, après confirmation."
      accessibilityState={{ disabled: disabled || isLoading, busy: isLoading }}
      disabled={disabled || isLoading} onPress={confirm}
      style={[s.button, compact && s.compactButton, waited && s.suggestedButton, (disabled || isLoading) && s.disabled]}>
      {isLoading ? <ActivityIndicator color={waited ? '#FFFFFF' : '#B83D0D'} />
        : <Text style={[s.label, waited && s.suggestedLabel]}>Changer de conducteur</Text>}
    </Pressable>
    {compact ? waited && <Text accessibilityLiveRegion="polite" style={s.caption}>Plus de 15 min d’attente · vous pouvez changer.</Text> : <>
    {waited && <Text accessibilityLiveRegion="polite" style={s.title}>Toujours en attente ?</Text>}
    <Text style={waited ? s.hint : s.caption}>{waited
      ? '15 min se sont écoulées depuis l’acceptation. S’il n’est pas là, cherchez un autre conducteur sans annuler votre commande.'
      : 'Votre commande est conservée.'}</Text></>}
    {error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
  </View>;
}

/** Reads only for the passenger's current, unboarded request-based reservation. */
export function PickupDriverChange({ requestId, booking, trip, active, onChanged, onPendingChange }: {
  requestId: string; booking: Booking; trip: Trip; active: boolean; onChanged?: (requestId: string) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const enabled = useDisplayReadsEnabled(active);
  const { currentData, isError } = useGetTripRequestByIdQuery(requestId, displayReadOptions(enabled));
  return <ChangeRequestDriverButton request={currentData?.id === requestId && currentData.tripId === trip.id ? currentData : undefined}
    booking={booking} trip={trip} disabled={!enabled || isError} onChanged={onChanged} onPendingChange={onPendingChange} />;
}
const s = StyleSheet.create({
  section: { width: '100%', gap: 6 },
  title: { fontSize: 16, fontWeight: '700', color: '#1E294A' },
  hint: { fontSize: 13, lineHeight: 19, color: '#536071' },
  caption: { fontSize: 12, lineHeight: 17, color: '#536071', textAlign: 'center' },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12,
    borderWidth: 1, borderColor: '#E6A78C', borderRadius: 24, backgroundColor: '#FFF0E8' },
  suggestedButton: { backgroundColor: '#D54100', borderColor: '#D54100' },
  compactButton: { minHeight: 44, padding: 9, borderRadius: 12 },
  suggestedLabel: { color: '#FFFFFF' },
  label: { color: '#B83D0D', fontSize: 15, fontWeight: '700', textAlign: 'center' }, disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 18, paddingVertical: 6 },
});
