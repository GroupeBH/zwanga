import { Colors } from '@/constants/styles';
import { PublishSeatSelector } from './PublishSeatSelector';
import { PublishPaymentModes } from './PublishPaymentModes';
import { PublishPassengerOptions } from './PublishPassengerOptions';
import type { TripPaymentMode, TripRequestVehicleType } from '@/types';
import Animated, { FadeInDown } from '@/utils/reanimated';
import React from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

interface PublishPricingStepProps {
  acceptedPaymentModes: TripPaymentMode[];
  setAcceptedPaymentModes: React.Dispatch<React.SetStateAction<TripPaymentMode[]>>;
  stepEntering: FadeInDown | undefined;
  setSeats: React.Dispatch<React.SetStateAction<string>>;
  seats: string;
  vehicleType: TripRequestVehicleType | null | undefined;
  isFreeTrip: boolean;
  price: string;
  setPrice: React.Dispatch<React.SetStateAction<string>>;
  setIsFreeTrip: React.Dispatch<React.SetStateAction<boolean>>;
  requiresPassengerKyc: boolean;
  setRequiresPassengerKyc: React.Dispatch<React.SetStateAction<boolean>>;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
}

export function PublishPricingStep({
  acceptedPaymentModes, setAcceptedPaymentModes, stepEntering,
  setSeats, seats, vehicleType, isFreeTrip, price, setPrice, setIsFreeTrip,
  requiresPassengerKyc, setRequiresPassengerKyc, description, setDescription,
}: PublishPricingStepProps) {
  return <Animated.View entering={stepEntering} style={s.container}>
    <View style={s.essentials}>
      <PublishSeatSelector seats={seats} setSeats={setSeats} vehicleType={vehicleType} />
      <View style={s.divider} />
      <View style={s.priceRow}>
        <Text style={s.title}>Prix par place</Text>
        <View style={s.priceField}>
          <TextInput accessibilityLabel="Prix par place en francs congolais" style={s.priceInput}
            placeholder={isFreeTrip ? 'Gratuit' : '2 000'} placeholderTextColor={Colors.gray[500]}
            keyboardType="number-pad" value={price} onChangeText={setPrice} editable={!isFreeTrip} />
          {!isFreeTrip && <Text style={s.currency}>FC</Text>}
        </View>
      </View>
      <View style={s.freeRow}>
        <Text style={s.label}>Trajet gratuit</Text>
        <Switch accessibilityLabel="Trajet gratuit" value={isFreeTrip}
          trackColor={{ false: Colors.gray[300], true: Colors.primary }}
          onValueChange={next => { setIsFreeTrip(next); if (next) setPrice(''); }} />
      </View>
    </View>
    {!isFreeTrip && <PublishPaymentModes value={acceptedPaymentModes} onChange={setAcceptedPaymentModes} price={Number(price) || 0} />}
    <PublishPassengerOptions requiresPassengerKyc={requiresPassengerKyc} setRequiresPassengerKyc={setRequiresPassengerKyc}
      description={description} setDescription={setDescription} />
  </Animated.View>;
}
const s = StyleSheet.create({
  container: { gap: 4 },
  essentials: { backgroundColor: Colors.white, borderRadius: 16, padding: 14, gap: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.gray[200], marginVertical: 2 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: Colors.gray[900], fontSize: 16, fontWeight: '700', flexShrink: 1 },
  priceField: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: 10,
    paddingHorizontal: 10, flex: 1, minWidth: 130 },
  priceInput: { flex: 1, width: 0, minWidth: 0, minHeight: 48, fontSize: 22, fontWeight: '700', color: Colors.gray[900], textAlign: 'right', paddingVertical: 8 },
  currency: { color: Colors.gray[600], fontSize: 13, marginLeft: 6 },
  freeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 8 },
  label: { flex: 1, color: Colors.gray[700], fontSize: 14 },
});
