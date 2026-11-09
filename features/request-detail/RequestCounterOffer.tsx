import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { RideModal } from '@/features/navigation/RideModal';
import { useProposeCounterOfferMutation } from '@/store/api/counterOfferApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { acknowledgeRideAlerts } from '@/services/rideAlertSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { requestTotalPrice, requestUnitPriceInput, requestTotalInputHint } from '@/features/trip-request/requestPriceDisplay';
import { counterOfferPrice } from './counterOfferPolicy';
import { formatCdfPrice } from './requestDetailModel';

export function RequestCounterOffer({ model, disabled }: { model: ReturnType<typeof useRequestDetailController>; disabled: boolean }) {
  const [visible, setVisible] = useState(false), [price, setPrice] = useState(''), [error, setError] = useState('');
  const [send, sending] = useProposeCounterOfferMutation();
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const request = model.tripRequest;
  const unitInput = requestUnitPriceInput(price, request?.numberOfSeats ?? 0, 0);
  const amount = counterOfferPrice(unitInput);
  const priceHint = requestTotalInputHint(price, request?.numberOfSeats ?? 0, 0)
    || (unitInput && amount === null ? `Prix maximum du trajet : ${formatCdfPrice(1000000 * (request?.numberOfSeats ?? 1))}.` : '');
  const pending = model.myOffer?.status === 'pending';
  if (!request || pending || !model.isIdentityVerified || !model.canAcceptDirectly) return null;
  const submit = async () => {
    if (!request || !amount || disabled || busy.current || !model.directAcceptVehicle || !model.isScreenActive) return;
    busy.current = true; setError('');
    const version = getTokenSessionVersion();
    try {
      await send({ requestId: request.id, vehicleId: model.directAcceptVehicle.id, pricePerSeat: amount }).unwrap();
      if (!mounted.current || version !== getTokenSessionVersion()) return;
      acknowledgeRideAlerts(alert => alert.recipientId === model.userId &&
        ((alert.kind === 'nearby' && alert.id === request.id) || (alert.kind === 'dispatch' && alert.data.tripRequestId === request.id)));
      setVisible(false); void model.refetch();
    } catch (cause) {
      if (mounted.current && version === getTokenSessionVersion()) {
        setError(getApiErrorMessage(cause, 'Envoi non confirmé. Actualisez la commande avant de réessayer.'));
        void model.refetch();
      }
    } finally { busy.current = false; }
  };
  return <>
    <Pressable accessibilityRole="button" disabled={disabled || !model.directAcceptVehicle} style={s.link}
      onPress={() => { setPrice(String(requestTotalPrice(request.maxPricePerSeat, request.numberOfSeats) ?? '')); setError(''); setVisible(true); }}>
      <Text style={[s.linkText, (disabled || !model.directAcceptVehicle) && s.disabled]}>Proposer un autre prix</Text>
    </Pressable>
    <RideModal inApp transparent visible={visible && model.isScreenActive && !pending} animationType="fade"
      onRequestClose={() => { if (!busy.current) setVisible(false); }}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" style={s.scroll} contentContainerStyle={s.panel}>
        <Text style={s.title}>Votre prix pour le trajet</Text>
        <Text style={s.hint}>Le passager recevra une alerte. Il devra accepter votre prix avant la prise en charge.</Text>
        <TextInput accessibilityLabel="Prix total proposé en francs congolais" keyboardType="number-pad" value={price}
          onChangeText={setPrice} maxLength={9} editable={!sending.isLoading} style={s.input} placeholder="Prix total en FC" />
        {amount !== null && <Text style={s.hint}>Total du trajet : {formatCdfPrice(amount * request.numberOfSeats)} pour {request.numberOfSeats} passager(s)</Text>}
        {!!priceHint && <Text accessibilityLiveRegion="polite" style={s.error}>{priceHint}</Text>}
        {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={!amount || disabled || sending.isLoading} style={[s.button, (!amount || disabled || sending.isLoading) && s.disabled]} onPress={() => { void submit(); }}>
          {sending.isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Envoyer mon prix au passager</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" style={s.link} disabled={sending.isLoading} onPress={() => setVisible(false)}><Text style={s.linkText}>Annuler</Text></Pressable>
      </ScrollView></KeyboardAvoidingView>
    </RideModal>
  </>;
}
const s = StyleSheet.create({ overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 },
  scroll: { flexGrow: 0, borderRadius: 24 }, panel: { backgroundColor: '#FFFFFF', padding: 20, gap: 12 }, title: { color: '#202734', fontSize: 20, fontWeight: '700' },
  hint: { color: '#536071', fontSize: 13, lineHeight: 19 }, input: { borderWidth: 1, borderColor: '#AEB5BF', borderRadius: 12,
    padding: 14, fontSize: 24, color: '#202734' }, link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#BA3E0F', fontWeight: '600' }, button: { backgroundColor: '#CE4613', padding: 14, minHeight: 50,
    borderRadius: 25, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '700' },
  disabled: { opacity: 0.5 }, error: { color: '#B42318', fontSize: 13 } });
