import React from 'react';
import { TextInput } from 'react-native';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { authCodeStyles as styles } from '@/features/auth/authCode.styles';
import { SignupOtpFields } from '../SignupOtpFields';

interface GoogleOtpStepProps {
  phone: string;
  otp: string[];
  otpRefs: React.MutableRefObject<(TextInput | null)[]>;
  onOtpChange: (otp: string[]) => void;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
  isVerifying: boolean;
  isResending: boolean;
  keyboardVisible?: boolean;
}

export function GoogleOtpStep({ phone, otp, otpRefs, onOtpChange, onVerify, onResend,
  onBack, isVerifying, isResending, keyboardVisible = false }: GoogleOtpStepProps) {
  return <Animated.View key="google-otp-step" entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}
    style={[styles.step, keyboardVisible && styles.keyboardStep]}>
    <SignupOtpFields phone={phone} code={otp} inputRefs={otpRefs} onChange={onOtpChange}
      onVerify={onVerify} onResend={onResend} onBack={onBack}
      isVerifying={isVerifying} isResending={isResending} keyboardVisible={keyboardVisible} />
  </Animated.View>;
}

