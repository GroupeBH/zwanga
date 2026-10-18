import React from 'react';
import { OtpCodeInput } from '../OtpCodeInput';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { ResetPinMode } from '../types';
import { OtpDeliveryNotice } from '../OtpDeliveryNotice';
import { AuthCodeHeading } from '../AuthCodeHeading';
import { authCodeStyles as codeStyles } from '@/features/auth/authCode.styles';

interface ResetPinStepProps {
  phone: string;
  resetPinStep: ResetPinMode;
  otpCode: string[];
  otpInputRefs: React.MutableRefObject<(TextInput | null)[]>;
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
  keyboardVisible?: boolean;
}

export function ResetPinStep({
  phone,
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
  keyboardVisible = false,
}: ResetPinStepProps) {
  const isOtpComplete = otpCode.join('').length === 6;
  const isPinValid = newPin.length === 4 && newPinConfirm.length === 4;

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp}
      style={[styles.stepContainer, codeStyles.step, keyboardVisible && codeStyles.keyboardStep]}>
      <AuthCodeHeading icon="key-outline" keyboardVisible={keyboardVisible}
        title={resetPinStep === 'otp' ? 'Réinitialiser le PIN' : 'Choisir un nouveau PIN'}
        subtitle={resetPinStep === 'otp' ? `Numéro à vérifier : ${phone}` : '4 chiffres, puis confirmez-les.'} />

      {resetPinStep === 'otp' ? (
        <>
          <OtpDeliveryNotice compact />
          <View>
            <OtpCodeInput code={otpCode} onChange={onOtpChange} inputRefs={otpInputRefs}
              compact label="Code à 6 chiffres" disabled={isLoading || isResending}
              containerStyle={codeStyles.codeRow}
              inputStyle={[styles.smsInput, codeStyles.codeInput, keyboardVisible && codeStyles.keyboardCodeInput]}
              filledStyle={styles.smsInputFilled} />
          </View>
          <View style={codeStyles.actions}>
            <TouchableOpacity
              style={[
                styles.mainButton,
                codeStyles.action,
                isOtpComplete ? styles.mainButtonActive : styles.mainButtonDisabled,
              ]}
              onPress={onVerifyOtp}
              disabled={!isOtpComplete || isLoading || isResending}
              accessibilityRole="button"
              accessibilityLabel={isLoading ? 'Vérification en cours' : 'Vérifier le code'}
              accessibilityState={{ disabled: !isOtpComplete || isLoading || isResending, busy: isLoading }}
            >
              {isLoading ? <ActivityIndicator color="white" /> : (
                <Text style={[styles.mainButtonText, codeStyles.actionText]}>Vérifier</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[codeStyles.action, codeStyles.secondaryAction]}
              onPress={onResendOtp}
              disabled={isResending || isLoading}
              accessibilityRole="button"
              accessibilityLabel="Renvoyer le code"
              accessibilityState={{ disabled: isResending || isLoading, busy: isResending }}
            >
              {isResending ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={codeStyles.secondaryText}>Renvoyer</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={codeStyles.fields}>
            <View style={codeStyles.field}>
              <Text style={codeStyles.label}>Nouveau PIN</Text>
              <View style={[styles.inputWrapper, codeStyles.inputWrapper]}>
                <TextInput
                  ref={pinInputRef}
                  style={[styles.input, codeStyles.input]}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  value={newPin}
                  onChangeText={onPinChange}
                  placeholder="4 chiffres"
                  accessibilityLabel="Nouveau code PIN à 4 chiffres"
                  editable={!isLoading}
                  placeholderTextColor={Colors.gray[400]}
                />
              </View>
            </View>
            <View style={codeStyles.field}>
              <Text style={codeStyles.label}>Confirmer</Text>
              <View style={[styles.inputWrapper, codeStyles.inputWrapper]}>
                <TextInput
                  ref={pinConfirmInputRef}
                  style={[styles.input, codeStyles.input]}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  value={newPinConfirm}
                  onChangeText={onPinConfirmChange}
                  placeholder="4 chiffres"
                  accessibilityLabel="Confirmation du code PIN à 4 chiffres"
                  editable={!isLoading}
                  placeholderTextColor={Colors.gray[400]}
                />
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.mainButton,
              codeStyles.fullWidthAction,
              isPinValid ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onResetPin}
            disabled={!isPinValid || isLoading}
            accessibilityRole="button"
            accessibilityLabel={isLoading ? 'Réinitialisation en cours' : 'Réinitialiser le PIN'}
            accessibilityState={{ disabled: !isPinValid || isLoading, busy: isLoading }}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={[styles.mainButtonText, codeStyles.actionText]}>Réinitialiser le PIN</Text>
                <Ionicons name="checkmark-circle-outline" size={24} color="white" />
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

