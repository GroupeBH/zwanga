import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { pendingDriverOffer } from './counterOfferPolicy';
import { requestPriceLabel } from '@/features/trip-request/requestPriceDisplay';

/** Withdrawal is not a new acceptance: no vehicle/KYC/driver-response deadline gate. */
export function RequestPendingOfferActions({ model }: { model: ReturnType<typeof useRequestDetailController> }) {
  const offer = pendingDriverOffer(model.tripRequest, model.userId);
  if (!offer) return null;
  const busy = model.isDecliningTripRequest;
  const disabled = busy || !model.isScreenActive || !model.canRespondToRequest;
  return <View style={s.footer} testID="request-pending-offer-actions">
    <Text style={s.title}>Votre prix : {requestPriceLabel(offer.pricePerSeat, model.tripRequest?.numberOfSeats)} pour le trajet</Text>
    <Text style={s.hint}>Votre prix a été envoyé pour cette commande. En attente de la réponse du passager.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy }} disabled={disabled}
      onPress={() => { if (!disabled) void model.handleDeclineTripRequest(); }} style={[s.button, disabled && s.disabled]}>
      {busy && <ActivityIndicator color="#BA3E0F" />}
      <Text style={s.buttonText}>{busy ? 'Retrait en cours…' : 'Retirer ma proposition'}</Text>
    </Pressable>
  </View>;
}
const s = StyleSheet.create({
  footer: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E4E7EC' },
  title: { color: '#202734', fontSize: 16, fontWeight: '700' },
  hint: { color: '#536071', fontSize: 13, lineHeight: 19 },
  button: { minHeight: 48, padding: 12, borderRadius: 16, backgroundColor: '#FFF2EB', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#BA3E0F', fontWeight: '700', fontSize: 15 }, disabled: { opacity: 0.5 },
});
