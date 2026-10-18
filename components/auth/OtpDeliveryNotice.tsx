import { Colors, FontSizes, Spacing } from '@/constants/styles';
import { otpDeliveryCopy } from '@/features/auth/otpDelivery';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function OtpDeliveryNotice({ beforeSend = false, compact = false }: { beforeSend?: boolean; compact?: boolean }) {
  if (compact) return (
    <View style={styles.compactNotice}>
      <Ionicons name="logo-whatsapp" size={18} color={Colors.gray[800]} accessible={false} />
      <Text style={styles.compactBody}>
        <Text style={styles.compactTitle}>{otpDeliveryCopy.title}.</Text>{' '}Consultez WhatsApp ou vos SMS.
      </Text>
    </View>
  );
  return (
    <View style={styles.notice}>
      <Ionicons name="logo-whatsapp" size={22} color={Colors.gray[800]} accessible={false} />
      <View style={styles.content}>
        <Text style={styles.title}>{otpDeliveryCopy.title}</Text>
        <Text style={styles.body}>
          {beforeSend ? otpDeliveryCopy.beforeSend : otpDeliveryCopy.enterCode}
        </Text>
        <Text style={styles.fallback}>{otpDeliveryCopy.fallback}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  compactBody: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18, color: Colors.gray[700] },
  compactTitle: { fontWeight: '600', color: Colors.gray[900] },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  content: { flex: 1, minWidth: 0, gap: Spacing.xs },
  title: { fontSize: FontSizes.base, fontWeight: '600', color: Colors.gray[900] },
  body: { fontSize: FontSizes.sm, lineHeight: 20, color: Colors.gray[800] },
  fallback: { fontSize: FontSizes.sm, lineHeight: 20, color: Colors.gray[700] },
});
