import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { RidePaymentNoticeModel } from './ridePaymentNoticeModel';

export function RidePaymentNoticeView({ notice }: { notice: RidePaymentNoticeModel | null }) {
  if (!notice) return null;
  const color = notice.tone === 'paid' ? Colors.successDark : notice.tone === 'warning' ? Colors.primaryDark : Colors.gray[800];
  return <View testID="ride-payment-notice" style={s.row}>
    <Ionicons name={notice.tone === 'paid' ? 'checkmark-circle-outline' : 'wallet-outline'} size={18} color={color} accessible={false} />
    <View style={s.copy}>
      <Text style={[s.title, { color }]}>{notice.title}</Text>
      <Text style={s.detail}>{notice.detail}</Text>
    </View>
  </View>;
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 12, color: Colors.gray[700] },
});
