import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RideModal } from '@/features/navigation/RideModal';
import { useProposeCounterOfferMutation } from '@/store/api/counterOfferApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { acknowledgeRideAlerts } from '@/services/rideAlertSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { counterOfferPrice } from './counterOfferPolicy';
import { formatCdfPrice } from './requestDetailModel';

export function RequestCounterOffer({ model, disabled }: { model: ReturnType<typeof useRequestDetailController>; disabled: boolean }) {
  const [visible, setVisible] = useState(false), [price, setPrice] = useState(''), [error, setError] = useState('');
  const [send, sending] = useProposeCounterOfferMutation();
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const amount = counterOfferPrice(price), request = model.tripRequest;
  const pending = model.myOffer?.status === 'pending';
  if (!request || !model.isIdentityVerified || (!model.canAcceptDirectly && !pending)) return null;
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
        setError(getApiErrorMessage(cause, 'Envoi non confirmé. Actualisez la demande avant de réessayer.'));
        void model.refetch();
      }
    } finally { busy.current = false; }
  };
  return <>
    {pending ? <View style={s.notice}>
      <Text style={s.hint}>Prix proposé : {formatCdfPrice(model.myOffer!.pricePerSeat)} par place. En attente du passager.</Text>
      <Pressable accessibilityRole="button" disabled={disabled} style={s.link} onPress={model.handleDeclineTripRequest}><Text style={s.linkText}>Retirer ma proposition</Text></Pressable>
    </View> : <Pressable accessibilityRole="button" disabled={disabled || !model.directAcceptVehicle} style={s.link}
      onPress={() => { setPrice(String(request.maxPricePerSeat ?? '')); setError(''); setVisible(true); }}>
      <Text style={[s.linkText, (disabled || !model.directAcceptVehicle) && s.disabled]}>Proposer un autre prix</Text>
    </Pressable>}
    <RideModal inApp transparent visible={visible && model.isScreenActive && !pending} animationType="fade"
      onRequestClose={() => { if (!busy.current) setVisible(false); }}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" style={s.scroll} contentContainerStyle={s.panel}>
        <Text style={s.title}>Votre prix par place</Text>
        <Text style={s.hint}>Le passager recevra une alerte. Il devra accepter votre prix avant la prise en charge.</Text>
        <TextInput accessibilityLabel="Prix proposé par place en francs congolais" keyboardType="number-pad" value={price}
          onChangeText={setPrice} maxLength={7} editable={!sending.isLoading} style={s.input} placeholder="Prix en FC" />
        {amount !== null && <Text style={s.hint}>Total pour {request.numberOfSeats} place(s) : {formatCdfPrice(amount * request.numberOfSeats)}</Text>}
        {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={!amount || disabled || sending.isLoading} style={[s.button, (!amount || disabled || sending.isLoading) && s.disabled]} onPress={() => { void submit(); }}>
          {sending.isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.buttonText}>Envoyer mon prix au passager</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" style={s.link} disabled={sending.isLoading} onPress={() => setVisible(false)}><Text style={s.linkText}>Annuler</Text></Pressable>
      </ScrollView></KeyboardAvoidingView>
    </RideModal>
  </>;
}
const s = StyleSheet.create({ notice: { gap: 4 }, overlay: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', padding: 20 },
  scroll: { flexGrow: 0, borderRadius: 24 }, panel: { backgroundColor: '#FFFFFF', padding: 20, gap: 12 }, title: { color: '#202734', fontSize: 20, fontWeight: '700' },
  hint: { color: '#536071', fontSize: 13, lineHeight: 19 }, input: { borderWidth: 1, borderColor: '#AEB5BF', borderRadius: 12,
    padding: 14, fontSize: 24, color: '#202734' }, link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#BA3E0F', fontWeight: '600' }, button: { backgroundColor: '#CE4613', padding: 14, minHeight: 50,
    borderRadius: 25, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#FFFFFF', fontWeight: '700' },
  disabled: { opacity: 0.5 }, error: { color: '#B42318', fontSize: 13 } });
