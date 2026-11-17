import React from 'react';
import { Text } from 'react-native';
import { Colors, FontSizes, Spacing } from '@/constants/styles';
import { otpCountdownLabel, type OtpCountdownPurpose } from '@/features/auth/otpCountdown';
import { useOtpCountdown } from '@/hooks/auth/useOtpCountdown';

export function OtpCountdown({ purpose, phone = '' }: { purpose: OtpCountdownPurpose; phone?: string }) {
  const seconds = useOtpCountdown(purpose, phone);
  return <Text style={{ color: Colors.gray[700], fontSize: FontSizes.sm, marginVertical: Spacing.sm }}>
    {otpCountdownLabel(seconds)}
  </Text>;
}
