import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, NativeSyntheticEvent, Platform, TextInputKeyPressEventData } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';

interface GoogleOtpStepProps {
  phone: string;
  otp: string[];
  otpRefs: React.MutableRefObject<Array<TextInput | null>>;
  onOtpChange: (otp: string[]) => void;
  onVerify: () => void;
  onResend: () => void;
  onBack: () => void;
  isVerifying: boolean;
  isResending: boolean;
}

export function GoogleOtpStep({
  phone,
  otp,
  otpRefs,
  onOtpChange,
  onVerify,
  onResend,
  onBack,
  isVerifying,
  isResending,
}: GoogleOtpStepProps) {
  const isOtpComplete = otp.join('').length === 5;
  const otpAutoComplete = Platform.OS === 'android' ? 'sms-otp' : 'one-time-code';

  const handleOtpInputChange = (text: string, index: number) => {
    const sanitized = text.replace(/\D/g, '');

    if (!sanitized) {
      const next = [...otp];
      next[index] = '';
      onOtpChange(next);
      return;
    }

    if (sanitized.length >= otp.length) {
      const full = sanitized.slice(0, otp.length).split('');
      onOtpChange(full);
      otpRefs.current[otp.length - 1]?.focus();
      return;
    }

    if (sanitized.length > 1) {
      const next = [...otp];
      let cursor = index;
      for (const digit of sanitized) {
        if (cursor > otp.length - 1) break;
        next[cursor] = digit;
        cursor += 1;
      }
      onOtpChange(next);
      const targetIndex = Math.min(cursor, otp.length - 1);
      otpRefs.current[targetIndex]?.focus();
      return;
    }

    const next = [...otp];
    next[index] = sanitized.slice(0, 1);
    onOtpChange(next);
    if (index < otp.length - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <Animated.View
      key="google-otp-step"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.stepContainer}
    >
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.secondary + '20' }]}>
          <Ionicons name="chatbubble-ellipses" size={40} color={Colors.secondary} />
        </View>
        <Text style={styles.heroTitle}>Vérification</Text>
        <Text style={styles.heroSubtitle}>
          Code envoyé au{' '}
          <Text style={{ fontWeight: 'bold', color: Colors.gray[900] }}>{phone}</Text>
        </Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
        <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>

        <View style={styles.smsCodeContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={`g-otp-${index}`}
              ref={(ref) => {
                otpRefs.current[index] = ref;
              }}
              style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
              keyboardType="number-pad"
              maxLength={otp.length}
              autoComplete={otpAutoComplete as any}
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              selectTextOnFocus
              value={digit}
              onChangeText={(text) => handleOtpInputChange(text, index)}
              onKeyPress={(e) => handleOtpKeyPress(e, index)}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.mainButton,
            styles.mainButtonActive,
            isVerifying && { opacity: 0.7 },
          ]}
          onPress={onVerify}
          disabled={isVerifying || !isOtpComplete}
        >
          {isVerifying ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={styles.mainButtonText}>Valider et continuer</Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.resendContainer}>
          <Text style={styles.resendText}>Vous n&apos;avez pas reçu le code ?</Text>
          <TouchableOpacity
            onPress={onResend}
            disabled={isResending}
            style={{ opacity: isResending ? 0.5 : 1 }}
          >
            <Text style={styles.resendLink}>
              {isResending ? 'Envoi en cours...' : 'Renvoyer'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.secondaryButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={18} color={Colors.primary} />
          <Text style={styles.secondaryButtonText}>Modifier le numéro</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

