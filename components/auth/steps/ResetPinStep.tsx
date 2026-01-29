import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { ResetPinStep as ResetPinStepType } from '../types';

interface ResetPinStepProps {
  resetPinStep: ResetPinStepType;
  otpCode: string[];
  otpInputRefs: React.MutableRefObject<Array<TextInput | null>>;
  newPin: string;
  newPinConfirm: string;
  pinInputRef: React.RefObject<TextInput | null>;
  pinConfirmInputRef: React.RefObject<TextInput | null>;
  onOtpChange: (otp: string[]) => void;
  onPinChange: (pin: string) => void;
  onPinConfirmChange: (pin: string) => void;
  onVerifyOtp: () => void;
  onResetPin: () => void;
  onResendOtp: () => void;
  isResending: boolean;
  isLoading: boolean;
}

export function ResetPinStep({
  resetPinStep,
  otpCode,
  otpInputRefs,
  newPin,
  newPinConfirm,
  pinInputRef,
  pinConfirmInputRef,
  onOtpChange,
  onPinChange,
  onPinConfirmChange,
  onVerifyOtp,
  onResetPin,
  onResendOtp,
  isResending,
  isLoading,
}: ResetPinStepProps) {
  const isOtpComplete = otpCode.join('').length === 5;
  const isPinValid = newPin.length === 4 && newPinConfirm.length === 4;

  const handleOtpInputChange = (text: string, index: number) => {
    const sanitized = text.replace(/\D/g, '').slice(0, 1);
    const next = [...otpCode];
    next[index] = sanitized;
    onOtpChange(next);
    if (sanitized && index < otpCode.length - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.secondary + '20' }]}>
          <Ionicons name="key" size={40} color={Colors.secondary} />
        </View>
        <Text style={styles.heroTitle}>Réinitialiser votre mot de passe PIN</Text>
        <Text style={styles.heroSubtitle}>
          {resetPinStep === 'otp'
            ? 'Un code de vérification sera envoyé à votre numéro de téléphone'
            : 'Créez un nouveau mot de passe PIN à 4 chiffres'}
        </Text>
      </View>

      {resetPinStep === 'otp' ? (
        <>
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
            <Text style={styles.inputLabelSmall}>5 chiffres reçus par SMS</Text>
            <View style={styles.smsCodeContainer}>
              {otpCode.map((digit, index) => (
                <TextInput
                  key={`reset-otp-${index}`}
                  ref={(ref) => {
                    otpInputRefs.current[index] = ref;
                  }}
                  style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
                  keyboardType="number-pad"
                  maxLength={1}
                  value={digit}
                  onChangeText={(text) => handleOtpInputChange(text, index)}
                  onKeyPress={(e) => handleOtpKeyPress(e, index)}
                />
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.mainButton,
              isOtpComplete ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onVerifyOtp}
            disabled={!isOtpComplete}
          >
            <Text style={styles.mainButtonText}>Vérifier</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resendButton}
            onPress={onResendOtp}
            disabled={isResending}
          >
            {isResending ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.resendButtonText}>Renvoyer le code</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Nouveau mot de passe PIN</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
              <TextInput
                ref={pinInputRef}
                style={styles.input}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={newPin}
                onChangeText={onPinChange}
                placeholder="Créez un nouveau PIN (4 chiffres)"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          </View>
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Confirmer le nouveau mot de passe PIN</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
              <TextInput
                ref={pinConfirmInputRef}
                style={styles.input}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={newPinConfirm}
                onChangeText={onPinConfirmChange}
                placeholder="Confirmez votre nouveau PIN (4 chiffres)"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.mainButton,
              isPinValid ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onResetPin}
            disabled={!isPinValid || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.mainButtonText}>Réinitialiser le PIN</Text>
                <Ionicons name="checkmark-circle-outline" size={24} color="white" />
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

