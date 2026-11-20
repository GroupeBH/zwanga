import React from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { creditEquipment } from '@/features/pro-services/assetCreditModel';
import { CreditProductScreen } from '@/features/pro-services/CreditProductScreen';
import { ServiceLayout, s } from '@/features/pro-services/ServiceLayout';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';

export default function CreditProductRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const user = useAppSelector(selectUser);
  const item = creditEquipment.find(item => item.kind === kind);
  if (!item) return <ServiceLayout title="Équipement introuvable"><Text style={s.text}>Revenez au catalogue pour choisir un équipement.</Text></ServiceLayout>;
  return <CreditProductScreen key={`${user?.id}:${item.kind}`} kind={item.kind} />;
}
