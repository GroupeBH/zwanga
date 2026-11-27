import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { useGetBookingPaymentRequestQuery, useRequestBookingPaymentMutation } from '@/store/api/bookingApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Booking } from '@/types';

/** Inline, no native modal/audio/GPS work. Only an invitation, never a debit. */
export function DriverNearArrivalPaymentNotice({ booking, active }: { booking: Booking | null; active: boolean }) {
  const id = booking?.id;
  const { currentData } = useGetBookingPaymentRequestQuery(id ?? '', { skip: !active || !id, refetchOnFocus: true });
  const [requestPayment] = useRequestBookingPaymentMutation();
  const [pending, setPending] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const key = id ? `${getTokenSessionVersion()}:${id}:${booking?.paymentMode}` : null;
  const live = useRef({ key, active }); live.current = { key, active };
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!active || !booking || !key) return null;
  const delivered = sent === key || Boolean(currentData?.bookingId === id && currentData?.requestedAt);
  const paying = booking.paymentStatus === 'initiated';
  const send = async () => {
    if (!mounted.current || busy.current || delivered || paying || live.current.key !== key || !live.current.active) return;
    const version = getTokenSessionVersion();
    busy.current = true; setPending(key); setError(null);
    const stillCurrent = () => mounted.current && live.current.key === key && version === getTokenSessionVersion();
    try {
      await requestPayment(booking.id).unwrap();
      if (stillCurrent()) setSent(key);
    } catch (failure) {
      if (stillCurrent()) setError({ key, message: getApiErrorMessage(failure, 'Envoi impossible. Actualisez votre position puis réessayez.') });
    } finally { busy.current = false; if (stillCurrent()) setPending(null); }
  };
  return <View testID="driver-near-arrival-payment" style={styles.container}>
    <Text style={styles.title}>{booking.droppedOff ? 'Arrivée confirmée' : 'Arrivée à moins de 500 m'} · {booking.paymentMode === 'points' ? 'Jetons' : 'Paiement électronique'}</Text>
    <Text accessibilityLiveRegion="polite" style={styles.text}>{paying ? 'Paiement en cours de confirmation.' : delivered
      ? 'Invitation envoyée. Le passager confirme sur son téléphone.'
      : booking.droppedOff ? 'Le trajet attend le règlement du passager.' : 'Votre passager peut régler avant l’arrivée.'}</Text>
    {!delivered && !paying && <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: pending === key, busy: pending === key }}
      disabled={pending === key} onPress={() => { void send(); }} style={styles.button}>
      <Text style={styles.buttonText}>{pending === key ? 'Envoi…' : 'Demander le paiement'}</Text>
    </TouchableOpacity>}
    {error?.key === key && <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { backgroundColor: '#FFF2E9', borderRadius: 14, padding: 10, gap: 5 },
  title: { color: Colors.gray[900], fontSize: 14, fontWeight: '700' },
  text: { color: Colors.gray[700], fontSize: 13 },
  button: { backgroundColor: Colors.primary, borderRadius: 12, padding: 12, minHeight: 44, alignItems: 'center' },
  buttonText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  error: { color: Colors.dangerDark, fontSize: 13 },
});
