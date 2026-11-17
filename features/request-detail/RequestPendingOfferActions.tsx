import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { NegotiationPriceInput } from './NegotiationPriceInput';
import { useRequestResponseWindow } from '@/hooks/request-detail/useRequestResponseWindow';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { pendingDriverOffer } from './counterOfferPolicy';
import { requestPriceLabel } from '@/features/trip-request/requestPriceDisplay';

/** Withdrawal is not a new acceptance: no vehicle/KYC/driver-response deadline gate. */
export function RequestPendingOfferActions({ model }: { model: ReturnType<typeof useRequestDetailController> }) {
  const offer = pendingDriverOffer(model.tripRequest, model.userId);
  if (!offer) return null;
  return <PendingActions key={offer.id} model={model} />;
}
function PendingActions({ model }: { model: ReturnType<typeof useRequestDetailController> }) {
  const [negotiating, setNegotiating] = useState(false);
  const response = useRequestResponseWindow(model.tripRequest, model.responseWindowStartedAt, model.isScreenActive, model.refetch);
  const offer = pendingDriverOffer(model.tripRequest, model.userId);
  if (!offer || !model.tripRequest) return null;
  const busy = model.isDecliningTripRequest || negotiating;
  const disabled = busy || !model.isScreenActive || !model.canRespondToRequest;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={{ maxHeight: 330 }} contentContainerStyle={s.footer} keyboardShouldPersistTaps="handled" testID="request-pending-offer-actions">
    <Text style={s.title}>{offer.negotiationStage === 'passenger_counter' ? 'Le passager propose' : offer.negotiationStage === 'driver_final' ? 'Votre prix ferme' : 'Votre prix'} : {requestPriceLabel(offer.pricePerSeat, model.tripRequest.numberOfSeats)} pour le trajet</Text>
    <Text style={s.hint}>{offer.negotiationStage === 'passenger_counter' ? 'Acceptez son prix ou envoyez votre dernier prix.' : 'En attente de la réponse du passager.'}</Text>
    {!!response.label && <Text style={s.hint}>{response.label}</Text>}
    <NegotiationPriceInput request={model.tripRequest} offer={offer} actor="driver" disabled={disabled || response.closed} refresh={model.refetch} onBusyChange={setNegotiating} />
    <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled}
      onPress={() => { if (!disabled) void model.handleDeclineTripRequest(); }} style={[s.button, disabled && s.disabled]}>
      {busy && <ActivityIndicator color="#BA3E0F" />}
      <Text style={s.buttonText}>{model.isDecliningTripRequest ? 'Retrait en cours…' : offer.negotiationStage === 'passenger_counter' ? 'Renoncer à cette commande' : 'Retirer ma proposition'}</Text>
    </Pressable>
  </ScrollView></KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E4E7EC' },
  title: { color: '#202734', fontSize: 16, fontWeight: '700' },
  hint: { color: '#536071', fontSize: 13, lineHeight: 19 },
  button: { minHeight: 48, padding: 12, borderRadius: 16, backgroundColor: '#FFF2EB', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#BA3E0F', fontWeight: '700', fontSize: 15 }, disabled: { opacity: 0.5 },
});
