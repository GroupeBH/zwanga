import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAcceptDriverOfferMutation } from '@/store/api/tripRequestApi';
import { useDeclineCounterOfferMutation } from '@/store/api/counterOfferApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { acknowledgeRideAlerts, dismissRideResponseNotice, pendingRideResponseNotices } from '@/services/rideAlertSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { TripRequest } from '@/types';
import { pendingPriceOffers } from './counterOfferPolicy';
import { requestPriceLabel } from '@/features/trip-request/requestPriceDisplay';

export function PassengerPriceOffers({ request, enabled, refresh }: { request: TripRequest; enabled: boolean; refresh: () => unknown }) {
  const router = useRouter();
  const [accept, accepting] = useAcceptDriverOfferMutation(), [decline, declining] = useDeclineCounterOfferMutation();
  const [error, setError] = useState('');
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const offers = pendingPriceOffers(request);
  const decide = async (offerId: string, yes: boolean) => {
    if (!enabled || busy.current || !offers.some(offer => offer.id === offerId)) return;
    const version = getTokenSessionVersion(); busy.current = true; setError('');
    try {
      if (yes) await accept({ tripRequestId: request.id, payload: { offerId } }).unwrap();
      else await decline({ requestId: request.id, offerId }).unwrap();
      if (!mounted.current || version !== getTokenSessionVersion()) return;
      acknowledgeRideAlerts(alert => alert.recipientId === request.passengerId && alert.data.offerId === offerId);
      pendingRideResponseNotices(request.passengerId).filter(alert => alert.data.offerId === offerId).forEach(dismissRideResponseNotice);
      refresh();
    } catch (cause) {
      if (mounted.current && version === getTokenSessionVersion()) {
        setError(getApiErrorMessage(cause, 'Réponse non confirmée. Actualisez avant de réessayer.')); refresh();
      }
    } finally { busy.current = false; }
  };
  const disabled = !enabled || accepting.isLoading || declining.isLoading;
  return <>{offers.map(offer => <View style={s.section} key={offer.id}>
    <Text style={s.title}>{offer.driverName || 'Un conducteur'} propose un prix</Text>
    <Text style={s.price}>{requestPriceLabel(offer.pricePerSeat, request.numberOfSeats)} pour le trajet</Text>
    <Text style={s.hint}>Pour {request.numberOfSeats} passager(s), avant une éventuelle aide Zwanga.</Text>
    {!!offer.vehicleInfo && <Text style={s.hint}>{offer.vehicleInfo}</Text>}
    {offer.requiresPassengerKyc && <Text style={s.hint}>Ce conducteur demande une identité vérifiée.</Text>}
    <View style={s.actions}>
      <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, s.secondary, disabled && s.disabled]} onPress={() => { void decide(offer.id, false); }}><Text style={s.secondaryText}>{declining.isLoading ? 'Refus en cours…' : 'Refuser et chercher un autre'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, s.primary, disabled && s.disabled]} onPress={() => { void decide(offer.id, true); }}>
        {accepting.isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Accepter ce prix</Text>}
      </Pressable>
    </View>
    <Text style={s.hint}>Si vous refusez, votre commande reste ouverte pour un autre conducteur.</Text>
    <Pressable accessibilityRole="button" disabled={disabled} style={s.link} onPress={() => router.push({ pathname: '/driver/[id]', params: { id: offer.driverId, viewOnly: 'true' } })}>
      <Text style={s.secondaryText}>Voir le conducteur</Text>
    </Pressable>
  </View>)}{!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}</>;
}
const s = StyleSheet.create({ section: { gap: 8, paddingVertical: 12 }, title: { color: '#202734', fontSize: 16, fontWeight: '700' },
  price: { color: '#202734', fontSize: 22, fontWeight: '800' }, hint: { color: '#536071', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8 }, button: { flex: 1, padding: 12, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#CE4613' }, secondary: { backgroundColor: '#F2F4F6' }, primaryText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryText: { color: '#BA3E0F', fontWeight: '600' }, link: { minHeight: 44, justifyContent: 'center' }, disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19 } });
