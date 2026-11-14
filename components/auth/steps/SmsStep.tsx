import React from 'react';
import { TextInput } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { authCodeStyles as styles } from '@/features/auth/authCode.styles';
import { AuthMode } from '../types';
import { SignupOtpFields } from '../SignupOtpFields';

interface SmsStepProps {
  mode: AuthMode;
  phone: string;
  smsCode: string[];
  smsInputRefs: React.MutableRefObject<(TextInput | null)[]>;
  onSmsCodeChange: (code: string[]) => void;
  onSubmit: () => void;
  onResend: () => void;
  isVerifying: boolean;
  isResending: boolean;
  keyboardVisible?: boolean;
}

export function SmsStep({ mode, phone, smsCode, smsInputRefs, onSmsCodeChange,
  onSubmit, onResend, isVerifying, isResending, keyboardVisible = false }: SmsStepProps) {
  return <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp}
    style={[styles.step, keyboardVisible && styles.keyboardStep]}>
    <SignupOtpFields phone={phone} code={smsCode} inputRefs={smsInputRefs}
      onChange={onSmsCodeChange} onVerify={onSubmit} onResend={onResend}
      isVerifying={isVerifying} isResending={isResending} keyboardVisible={keyboardVisible}
      submitLabel={mode === 'login' ? 'Se connecter' : 'Vérifier'} />
  </Animated.View>;
}

