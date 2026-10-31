import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useChangeRequestDriverMutation } from '@/store/api/requestDriverApi';
import { tripRequestApi, useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { displayReadOptions } from '@/hooks/useDisplayReads';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking, TripRequest } from '@/types';
import { canChangeRequestDriver } from './requestDriverChangePolicy';

export function ChangeRequestDriverButton({ request, booking, disabled, onChanged }: {
  request?: TripRequest; booking?: Booking; disabled?: boolean; onChanged?: (requestId: string) => void;
}) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const dispatch = useAppDispatch(), router = useRouter();
  const { showDialog } = useDialog();
  const [change, { isLoading }] = useChangeRequestDriverMutation();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false), mounted = useRef(true);
  const latest = useRef({ request, booking, disabled, userId });
  latest.current = { request, booking, disabled, userId };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!canChangeRequestDriver(request, userId, booking)) return null;
  const confirm = () => {
    if (disabled || busy.current) return;
    const selection = request!, version = getTokenSessionVersion();
    showDialog({ title: 'Changer de conducteur ?',
      message: 'La prise en charge avec ce conducteur sera annulée. Votre demande sera conservée pour chercher un autre conducteur.',
      variant: 'warning', actions: [
        { label: 'Garder ce conducteur', variant: 'secondary' },
        { label: 'Chercher un autre', onPress: async () => {
          const current = latest.current;
          if (busy.current || !mounted.current || current.disabled || version !== getTokenSessionVersion() ||
              !canChangeRequestDriver(current.request, current.userId, current.booking) ||
              current.request?.selectedAt !== selection.selectedAt || current.request?.selectedDriverId !== selection.selectedDriverId) return;
          busy.current = true; setError(null);
          try {
            const updated = await change({ id: selection.id, selectedDriverId: selection.selectedDriverId!, selectedAt: selection.selectedAt! }).unwrap();
            if (!mounted.current || version !== getTokenSessionVersion()) return;
            await dispatch(tripRequestApi.util.upsertQueryData('getTripRequestById', updated.id, updated));
            if (mounted.current && version === getTokenSessionVersion()) {
              if (onChanged) onChanged(updated.id);
              else router.replace({ pathname: '/request/[id]', params: { id: updated.id } });
              // Do not unmount the pickup action through a booking refetch before navigation.
              dispatch(tripRequestApi.util.invalidateTags(['Booking', 'Trip']));
            }
          } catch (cause) {
            if (mounted.current && version === getTokenSessionVersion()) setError(getApiErrorMessage(cause,
              'Changement non confirmé. Actualisez avant de réessayer ; votre demande est conservée.'));
          } finally { busy.current = false; }
        } },
      ] });
  };
  return <View><Pressable accessibilityRole="button" disabled={disabled || isLoading} onPress={confirm}
    style={[s.button, (disabled || isLoading) && s.disabled]}>
    {isLoading ? <ActivityIndicator color="#B83D0D" /> : <Text style={s.label}>Changer de conducteur</Text>}
  </Pressable>{error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}</View>;
}

/** Reads only for the passenger's current, unboarded request-based reservation. */
export function PickupDriverChange({ requestId, booking, active, onChanged }: {
  requestId: string; booking: Booking; active: boolean; onChanged: (requestId: string) => void;
}) {
  const { currentData, isError } = useGetTripRequestByIdQuery(requestId, displayReadOptions(active));
  return <ChangeRequestDriverButton request={currentData} booking={booking} disabled={!active || isError} onChanged={onChanged} />;
}
const s = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 10 },
  label: { color: '#B83D0D', fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 18, paddingVertical: 6 },
});
