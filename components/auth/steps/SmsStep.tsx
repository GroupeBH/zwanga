import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, NativeSyntheticEvent, TextInputKeyPressEventData, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';

interface SmsStepProps {
  mode: AuthMode;
  phone: string;
  smsCode: string[];
  smsInputRefs: React.MutableRefObject<Array<TextInput | null>>;
  onSmsCodeChange: (code: string[]) => void;
  onSubmit: () => void;
  onResend: () => void;
  isVerifying: boolean;
  isResending: boolean;
}

export function SmsStep({
  mode,
  phone,
  smsCode,
  smsInputRefs,
  onSmsCodeChange,
  onSubmit,
  onResend,
  isVerifying,
  isResending,
}: SmsStepProps) {
  const isCodeComplete = smsCode.join('').length === 5;
  const otpAutoComplete = Platform.OS === 'android' ? 'sms-otp' : 'one-time-code';

  const handleSmsInputChange = (text: string, index: number) => {
    const sanitized = text.replace(/\D/g, '');

    // Backspace or clear
    if (!sanitized) {
      const next = [...smsCode];
      next[index] = '';
      onSmsCodeChange(next);
      return;
    }

    // Full OTP autofill from keyboard suggestion/SMS parser.
    if (sanitized.length >= smsCode.length) {
      const full = sanitized.slice(0, smsCode.length).split('');
      onSmsCodeChange(full);
      smsInputRefs.current[smsCode.length - 1]?.focus();
      return;
    }

    // Paste/autofill starting from current index.
    if (sanitized.length > 1) {
      const next = [...smsCode];
      let cursor = index;
      for (const digit of sanitized) {
        if (cursor > smsCode.length - 1) break;
        next[cursor] = digit;
        cursor += 1;
      }
      onSmsCodeChange(next);
      const targetIndex = Math.min(cursor, smsCode.length - 1);
      smsInputRefs.current[targetIndex]?.focus();
      return;
    }

    // Classic one-digit typing.
    const next = [...smsCode];
    next[index] = sanitized.slice(0, 1);
    onSmsCodeChange(next);
    if (index < smsCode.length - 1) {
      smsInputRefs.current[index + 1]?.focus();
    }
  };

  const handleSmsKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !smsCode[index] && index > 0) {
      smsInputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.secondary + '20' }]}>
          <Ionicons name="chatbubble-ellipses" size={40} color={Colors.secondary} />
        </View>
        <Text style={styles.heroTitle}>Vérification</Text>
        <Text style={styles.heroSubtitle}>
          Code de vérification (OTP) envoyé au{' '}
          <Text style={{ fontWeight: 'bold', color: Colors.gray[900] }}>{phone}</Text>
        </Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
        <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>
        <View style={styles.smsCodeContainer}>
          {smsCode.map((digit, index) => (
            <TextInput
              key={`sms-${index}`}
              ref={(ref) => {
                smsInputRefs.current[index] = ref;
              }}
              style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
              keyboardType="number-pad"
              maxLength={smsCode.length}
              autoComplete={otpAutoComplete as any}
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              selectTextOnFocus
              value={digit}
              onChangeText={(text) => handleSmsInputChange(text, index)}
              onKeyPress={(e) => handleSmsKeyPress(e, index)}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.mainButton,
          isCodeComplete ? styles.mainButtonActive : styles.mainButtonDisabled,
        ]}
        onPress={onSubmit}
        disabled={!isCodeComplete || isVerifying}
      >
        {isVerifying ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Text style={styles.mainButtonText}>
              {mode === 'login' ? 'Se connecter' : 'Vérifier'}
            </Text>
            <Ionicons name="checkmark-circle-outline" size={24} color="white" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={onResend}
        disabled={isResending}
      >
        {isResending ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={styles.resendButtonText}>Renvoyer le code</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

