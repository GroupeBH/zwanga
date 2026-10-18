import React from 'react';
import { Keyboard, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { Colors } from '@/constants/styles';
import { useAppSelector } from '@/store/hooks';
import { useReferralQr, type ReferralQrSource } from '@/hooks/referrals/useReferralQr';
import { ReferralQrModal } from './ReferralQrModal';
import { styles } from './ReferralQr.styles';

export function ReferralQrAction(props: ReferralQrSource) {
  const userId = useAppSelector(state => state.auth.isAuthenticated
    ? state.auth.user?.id ?? state.auth.tokenPayload?.sub : undefined);
  const active = useIsFocused();
  const qr = useReferralQr({ ...props, userId, active });
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Afficher mon QR code de parrainage"
      onPress={() => { Keyboard.dismiss(); void qr.open(); }} activeOpacity={0.8} style={styles.entry}>
      <Ionicons name="qr-code-outline" size={22} color={Colors.primaryDark} />
      <Text style={styles.entryText}>Mon QR code</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.primaryDark} />
    </TouchableOpacity>
    {qr.state && <ReferralQrModal state={qr.state} onClose={qr.close} onRetry={qr.open} />}
  </>;
}
