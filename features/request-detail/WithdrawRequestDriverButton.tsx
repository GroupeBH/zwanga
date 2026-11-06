import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDialog } from '@/components/ui/DialogProvider';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useWithdrawRequestDriverMutation } from '@/store/api/requestDriverApi';
import { tripRequestApi, useGetTripRequestByIdQuery } from '@/store/api/tripRequestApi';
import { useGetTripBookingsQuery } from '@/store/api/bookingApi';
import { displayReadOptions, useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking, Trip, TripRequest } from '@/types';
import { canWithdrawRequestDriver } from './requestDriverChangePolicy';

type Props = { request?: TripRequest; trip?: Trip; bookings?: Booking[]; disabled?: boolean;
  onWithdrawn: () => void; onPendingChange?: (pending: boolean) => void };

export function WithdrawRequestDriverButton({ request, trip, bookings, disabled, onWithdrawn, onPendingChange }: Props) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const enabled = useDisplayReadsEnabled(!disabled);
  const dispatch = useAppDispatch();
  const { showDialog } = useDialog();
  const [withdraw, { isLoading }] = useWithdrawRequestDriverMutation();
  const { currentData: fetchedBookings, isError } = useGetTripBookingsQuery(request?.tripId ?? '',
    displayReadOptions(enabled && !!request?.tripId && request.selectedDriverId === userId && bookings === undefined));
  const reservations = bookings ?? fetchedBookings;
  const blocked = !enabled || (bookings === undefined && isError);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false), mounted = useRef(true);
  const latest = useRef({ request, trip, reservations, userId, blocked, onWithdrawn });
  latest.current = { request, trip, reservations, userId, blocked, onWithdrawn };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!canWithdrawRequestDriver(request, userId, trip, reservations)) return null;

  const confirm = () => {
    if (blocked || busy.current) return;
    const selection = request!, version = getTokenSessionVersion();
    showDialog({ title: 'Annuler votre prise en charge ?', variant: 'warning',
      message: 'Vous ne prendrez plus ce passager. Il sera averti et sa commande sera relancée auprès d’autres conducteurs.',
      actions: [{ label: 'Garder la course', variant: 'secondary' },
        { label: 'Annuler ma prise en charge', variant: 'danger', onPress: async () => {
          const current = latest.current;
          if (busy.current || !mounted.current || current.blocked || version !== getTokenSessionVersion() ||
              current.userId !== userId || current.request?.id !== selection.id ||
              current.request?.selectedAt !== selection.selectedAt ||
              !canWithdrawRequestDriver(current.request, current.userId, current.trip, current.reservations)) return;
          busy.current = true; setError(null); onPendingChange?.(true);
          try {
            const result = await withdraw({ id: selection.id, selectedAt: selection.selectedAt! }).unwrap();
            if (!mounted.current || version !== getTokenSessionVersion() || latest.current.request?.id !== selection.id ||
                latest.current.userId !== userId) return;
            if (result.id !== selection.id || result.withdrawn !== true) throw new Error('Invalid withdrawal receipt');
            latest.current.onWithdrawn();
            dispatch(tripRequestApi.util.invalidateTags(['TripRequest', 'MyTripRequests', 'AccountActivity', 'Notification', 'Booking', 'Trip']));
          } catch (cause) {
            if (mounted.current && version === getTokenSessionVersion() && latest.current.request?.id === selection.id) setError(getApiErrorMessage(cause,
              'Annulation non confirmée. Actualisez la commande avant de réessayer.'));
          } finally {
            busy.current = false;
            if (mounted.current && version === getTokenSessionVersion()) onPendingChange?.(false);
          }
        } }],
    });
  };
  return <View><Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked || isLoading, busy: isLoading }}
    disabled={blocked || isLoading} onPress={confirm} style={[s.button, (blocked || isLoading) && s.disabled]}>
    {isLoading ? <ActivityIndicator color="#B42318" /> : <Text style={s.label}>Annuler ma prise en charge</Text>}
  </Pressable>{error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}</View>;
}

/** Reuses existing trip/bookings data. No background polling or generic trip cancellation. */
export function TripDriverWithdrawal({ trip, bookings, active, onWithdrawn, onPendingChange }: {
  trip: Trip; bookings?: Booking[]; active: boolean; onWithdrawn: () => void; onPendingChange?: (pending: boolean) => void;
}) {
  const enabled = useDisplayReadsEnabled(active && !!trip.tripRequestId && ['upcoming', 'ongoing'].includes(trip.status));
  const { currentData, isError } = useGetTripRequestByIdQuery(trip.tripRequestId ?? '', displayReadOptions(enabled));
  return <WithdrawRequestDriverButton request={currentData} trip={trip} bookings={bookings}
    disabled={!enabled || isError} onWithdrawn={onWithdrawn} onPendingChange={onPendingChange} />;
}

const s = StyleSheet.create({
  button: { minHeight: 44, borderWidth: 1, borderColor: '#E3BCB9', borderRadius: 16, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  label: { color: '#B42318', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 }, error: { color: '#B42318', fontSize: 13, lineHeight: 18, paddingVertical: 6 },
});
