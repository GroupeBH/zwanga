import { Colors, FontSizes, Spacing } from '@/constants/styles';
import { otpDeliveryCopy } from '@/features/auth/otpDelivery';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function OtpDeliveryNotice({ beforeSend = false }: { beforeSend?: boolean }) {
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
