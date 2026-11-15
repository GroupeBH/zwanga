import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { s } from '@/features/pro-services/ServiceLayout';

export const CREDIT_REPAYMENTS_HREF = '/services/credit/repayments' as const;

/** A navigation entry only: no background credit or wallet request. */
export function CreditRepaymentsLink({ active = true }: { active?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mes remboursements"
    testID="credit-repayments-link" accessibilityState={{ disabled: !active }} disabled={!active}
    style={[s.section, s.row]} onPress={() => { if (active) router.push(CREDIT_REPAYMENTS_HREF); }}>
    <Ionicons name="wallet-outline" size={24} color="#C34412" />
    <View style={s.flex}>
      <Text style={s.label}>Mes remboursements</Text>
      <Text style={s.text}>Montants restants et historique</Text>
    </View>
    <Ionicons name="chevron-forward" size={20} color="#647582" />
  </TouchableOpacity>;
}
