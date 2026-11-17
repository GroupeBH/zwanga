import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DriverOffer, TripRequest } from '@/types';
import { useNegotiateRequestPriceMutation, useAcceptPassengerPriceMutation } from '@/store/api/priceNegotiationApi';
import { requestUnitPriceInput, requestTotalInputHint } from '@/features/trip-request/requestPriceDisplay';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { acknowledgeRideAlerts, dismissRideResponseNotice, pendingRideResponseNotices } from '@/services/rideAlertSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { counterOfferPrice } from './counterOfferPolicy';
import { negotiationActions } from './priceNegotiation';

/** Inline editing avoids an additional native modal over the request/alert overlay. */
export function NegotiationPriceInput({ request, offer, actor, disabled, refresh, onBusyChange }: {
  request: TripRequest; offer: DriverOffer; actor: 'passenger' | 'driver'; disabled: boolean;
  refresh: () => unknown; onBusyChange: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false), [price, setPrice] = useState(''), [error, setError] = useState('');
  const [send, sending] = useNegotiateRequestPriceMutation(), [accept, accepting] = useAcceptPassengerPriceMutation();
  const mounted = useRef(true), lock = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const actions = negotiationActions(offer, actor);
  const amount = counterOfferPrice(requestUnitPriceInput(price, request.numberOfSeats, 0));
  const hint = requestTotalInputHint(price, request.numberOfSeats, 0);
  const pending = sending.isLoading || accepting.isLoading;
  const submit = async (agree: boolean) => {
    if (disabled || lock.current || (agree ? !actions.accept || actor !== 'driver' : !amount || !(actions.counter || actions.final))) return;
    const version = getTokenSessionVersion();
    lock.current = true; onBusyChange(true); setError('');
    try {
      if (agree) await accept({ requestId: request.id, offerId: offer.id }).unwrap();
      else await send({ requestId: request.id, offerId: offer.id, pricePerSeat: amount!, stage: actor === 'passenger' ? 'passenger_counter' : 'driver_final' }).unwrap();
      if (!mounted.current || version !== getTokenSessionVersion()) return;
      const userId = actor === 'passenger' ? request.passengerId : offer.driverId;
      acknowledgeRideAlerts(alert => alert.recipientId === userId && alert.data.offerId === offer.id);
      pendingRideResponseNotices(userId).filter(alert => alert.data.offerId === offer.id).forEach(dismissRideResponseNotice);
      setOpen(false); refresh();
    } catch (cause) {
      if (mounted.current && version === getTokenSessionVersion()) {
        setError(getApiErrorMessage(cause, 'Réponse non confirmée. Actualisez la commande.')); refresh();
      }
    } finally {
      lock.current = false;
      if (mounted.current && version === getTokenSessionVersion()) onBusyChange(false);
    }
  };
  if (!(actions.counter || actions.final)) return null;
  return <View style={s.panel}>
    {actor === 'driver' && <Pressable accessibilityRole="button" disabled={disabled || pending} style={s.primary} onPress={() => void submit(true)}>
      {accepting.isLoading ? <ActivityIndicator color="white" /> : <Text style={s.white}>Accepter le prix du passager</Text>}
    </Pressable>}
    {!open ? <Pressable accessibilityRole="button" disabled={disabled || pending} style={s.link} onPress={() => setOpen(true)}>
      <Text style={s.linkText}>{actor === 'driver' ? 'Proposer mon prix ferme' : 'Proposer mon prix'}</Text>
    </Pressable> : <>
      <Text style={s.hint}>{actor === 'driver' ? 'Dernier prix : le passager pourra accepter ou chercher ailleurs.' : 'Le conducteur pourra accepter ou proposer son prix ferme.'}</Text>
      <TextInput accessibilityLabel="Votre prix total en FC" style={s.input} value={price} onChangeText={setPrice}
        keyboardType="number-pad" maxLength={9} placeholder="Total du trajet en FC" editable={!disabled && !pending} />
      {!!hint && <Text style={s.error}>{hint}</Text>}
      <Pressable accessibilityRole="button" disabled={disabled || pending || !amount} style={[s.primary, (disabled || pending || !amount) && s.disabled]} onPress={() => void submit(false)}>
        {sending.isLoading ? <ActivityIndicator color="white" /> : <Text style={s.white}>{actor === 'driver' ? 'Envoyer mon prix ferme' : 'Envoyer mon prix'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" disabled={pending} style={s.link} onPress={() => setOpen(false)}><Text style={s.linkText}>Fermer</Text></Pressable>
    </>}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({ panel: { gap: 8 }, hint: { color: '#536071', fontSize: 13, lineHeight: 19 },
  input: { minHeight: 48, borderWidth: 1, borderColor: '#AEB5BF', borderRadius: 12, padding: 12, fontSize: 18, color: '#202734' },
  primary: { minHeight: 48, padding: 12, borderRadius: 16, backgroundColor: '#CE4613', alignItems: 'center', justifyContent: 'center' },
  white: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center' }, link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#BA3E0F', fontWeight: '600' }, error: { color: '#B42318', fontSize: 13 }, disabled: { opacity: 0.5 } });
