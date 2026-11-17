import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import { OtpDeliveryNotice } from '../OtpDeliveryNotice';
import { authPhoneCopy, isAuthPhoneValid } from '@/features/auth/authPhone';
import { authSimpleStyles as simple } from '@/features/auth/authSimple.styles';

interface GooglePhoneStepProps {
  profileName: string | null;
  provider?: 'google' | 'apple';
  phone: string;
  onPhoneChange: (phone: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
  submitLabel?: string;
}

export function GooglePhoneStep({
  provider = 'google',
  phone,
  onPhoneChange,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel = 'Recevoir le code',
}: GooglePhoneStepProps) {
  const isPhoneValid = isAuthPhoneValid(phone);
  const providerName = provider === 'apple' ? 'Apple' : 'Google';

  return (
    <Animated.View
      key="google-phone-step"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={simple.step}
    >
      <View style={simple.heading}>
        <Text style={simple.title} accessibilityRole="header">Votre numéro de téléphone</Text>
        <Text style={simple.subtitle}>À associer à votre compte {providerName}.</Text>
      </View>

      <View style={simple.form}>

        <View style={[styles.inputWrapper, simple.inputWrapper]}>
          <Ionicons name="call-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
          <TextInput
            style={[styles.input, simple.input]}
            placeholder="Votre numéro de téléphone"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            autoCorrect={false}
            accessibilityLabel="Numéro de téléphone"
            accessibilityHint={authPhoneCopy.hint}
            value={phone}
            editable={!isLoading}
            onChangeText={onPhoneChange}
            autoFocus={Platform.OS !== 'android'}
          />
        </View>

        <Text style={styles.phoneHint}>{authPhoneCopy.hint}</Text>

        {isSignupOtpVerificationEnabled && <OtpDeliveryNotice beforeSend compact />}

        <TouchableOpacity
          style={[
            styles.mainButton,
            isPhoneValid && !isLoading ? styles.mainButtonActive : styles.mainButtonDisabled,
            simple.button,
          ]}
          onPress={onSubmit}
          disabled={!isPhoneValid || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={[styles.mainButtonText, simple.buttonText]}>{submitLabel}</Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.secondaryButton, simple.button]} onPress={onCancel} disabled={isLoading}>
          <Ionicons name="arrow-back" size={18} color={Colors.primaryDark} />
          <Text style={styles.secondaryButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

