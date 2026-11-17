import React from 'react';
import { OtpCountdown } from './OtpCountdown';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { authCodeStyles as compact } from '@/features/auth/authCode.styles';
import { AuthCodeHeading } from './AuthCodeHeading';
import { OtpCodeInput } from './OtpCodeInput';
import { authStyles as styles } from './styles';

interface Props {
  phone: string;
  code: string[];
  inputRefs: React.MutableRefObject<(TextInput | null)[]>;
  onChange: (code: string[]) => void;
  onVerify: () => void;
  onResend: () => void;
  onBack?: () => void;
  isVerifying: boolean;
  isResending: boolean;
  keyboardVisible?: boolean;
  submitLabel?: string;
}

/** Presentation only: the existing controllers own OTP delivery and verification. */
export function SignupOtpFields({ phone, code, inputRefs, onChange, onVerify, onResend,
  onBack, isVerifying, isResending, keyboardVisible = false, submitLabel = 'Vérifier' }: Props) {
  const busy = isVerifying || isResending;
  const complete = code.join('').length === 5;
  return <>
    <AuthCodeHeading title="Vérifiez votre numéro" subtitle={`Code SMS pour le ${phone}`}
      icon="chatbubble-outline" keyboardVisible={keyboardVisible} />
    <OtpCodeInput code={code} onChange={onChange} inputRefs={inputRefs} disabled={busy}
      compact label="Code SMS · 5 chiffres" containerStyle={compact.codeRow}
      inputStyle={[styles.smsInput, compact.codeInput, keyboardVisible && compact.keyboardCodeInput]}
      filledStyle={styles.smsInputFilled} />
    <OtpCountdown purpose="phone_verification" phone={phone} />
    <View style={compact.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={submitLabel}
        accessibilityState={{ disabled: !complete || busy, busy: isVerifying }}
        style={[styles.mainButton, complete && !busy ? styles.mainButtonActive : styles.mainButtonDisabled, compact.action]}
        onPress={onVerify} disabled={!complete || busy}>
        {isVerifying ? <ActivityIndicator color="white" /> : <Text style={[styles.mainButtonText, compact.actionText]}>{submitLabel}</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Renvoyer le code"
        accessibilityState={{ disabled: busy, busy: isResending }}
        style={[compact.action, compact.secondaryAction]} onPress={onResend} disabled={busy}>
        {isResending ? <ActivityIndicator color={Colors.primary} /> : <Text style={compact.secondaryText}>Renvoyer le code</Text>}
      </TouchableOpacity>
    </View>
    {onBack && <TouchableOpacity style={compact.changePhone} onPress={onBack} disabled={busy}
      accessibilityRole="button" accessibilityState={{ disabled: busy }}>
      <Text style={compact.secondaryText}>Modifier le numéro</Text>
    </TouchableOpacity>}
    <Text style={compact.help}>Ne partagez ce code avec personne.</Text>
  </>;
}
