import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import { OtpDeliveryNotice } from '../OtpDeliveryNotice';
import { authPhoneCopy, isAuthPhoneValid } from '@/features/auth/authPhone';
import { authSimpleStyles as simple } from '@/features/auth/authSimple.styles';

interface PhoneStepProps {
  mode: AuthMode;
  phone: string;
  onPhoneChange: (phone: string) => void;
  onSubmit: () => void;
  onGoogleAuth: () => void;
  onAppleAuth?: () => void;
  isLoading: boolean;
  isGoogleLoading: boolean;
  isAppleLoading?: boolean;
  isAppleAvailable?: boolean;
  hasReferralAttribution?: boolean;
  referrerFirstName?: string;
}

export function PhoneStep({
  mode,
  phone,
  onPhoneChange,
  onSubmit,
  onGoogleAuth,
  onAppleAuth,
  isLoading,
  isGoogleLoading,
  isAppleLoading = false,
  isAppleAvailable = false,
  hasReferralAttribution = false,
  referrerFirstName,
}: PhoneStepProps) {
  const isPhoneValid = isAuthPhoneValid(phone);
  const showAppleAuth = Platform.OS === 'ios' && isAppleAvailable && onAppleAuth;
  const isAnySocialLoading = isGoogleLoading || isAppleLoading;
  const appleButtonLabel = mode === 'login' ? 'Continuer avec Apple' : 'S\'inscrire avec Apple';
  const handleAppleAuthPress = () => {
    if (!isAnySocialLoading) {
      onAppleAuth?.();
    }
  };

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={simple.step}>
      <View style={simple.heading}>
        <Text style={simple.brand}>Zwanga</Text>
        <Text style={simple.title} accessibilityRole="header">
          {mode === 'login' ? 'Connectez-vous' : 'Créez votre compte'}
        </Text>
      </View>

      {hasReferralAttribution && (
        <View style={styles.referralNotice}>
          <View style={styles.referralNoticeIcon}>
            <Ionicons name="gift-outline" size={20} color={Colors.primaryDark} />
          </View>
          <View style={styles.referralNoticeContent}>
            <Text style={styles.referralNoticeTitle}>
              {referrerFirstName
                ? `Invitation de ${referrerFirstName}`
                : 'Invitation Zwanga détectée'}
            </Text>
            <Text style={styles.referralNoticeText}>
              {mode === 'login'
                ? "Après connexion, elle sera appliquée si votre compte n'a pas encore de parrain."
                : 'Vous pouvez créer un compte ou choisir Connexion si vous en possédez déjà un.'}
            </Text>
          </View>
        </View>
      )}

      <View style={simple.form}>
        <Text style={simple.label}>Numéro de téléphone</Text>
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
            editable={!isLoading && !isAnySocialLoading}
            onChangeText={onPhoneChange}
          />
        </View>

        <Text style={styles.phoneHint}>{authPhoneCopy.hint}</Text>

        {mode === 'signup' && isSignupOtpVerificationEnabled && <OtpDeliveryNotice beforeSend compact />}

        <TouchableOpacity
          style={[
            styles.mainButton,
            isPhoneValid && !isLoading && !isAnySocialLoading ? styles.mainButtonActive : styles.mainButtonDisabled,
            simple.button,
          ]}
          onPress={onSubmit}
          disabled={!isPhoneValid || isLoading || isAnySocialLoading}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isPhoneValid || isLoading || isAnySocialLoading, busy: isLoading }}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={[styles.mainButtonText, simple.buttonText]}>{mode === 'signup' && isSignupOtpVerificationEnabled ? 'Recevoir le code' : 'Continuer'}</Text>
              <Ionicons name="arrow-forward" size={22} color="white" />
            </>
          )}
        </TouchableOpacity>

        <View style={[styles.dividerRow, simple.divider]}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OU</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, simple.button, (isAnySocialLoading || isLoading) && { opacity: 0.7 }]}
          onPress={onGoogleAuth}
          disabled={isAnySocialLoading || isLoading}
          accessibilityRole="button"
          accessibilityLabel={isGoogleLoading ? 'Connexion Google en cours' : mode === 'login' ? 'Continuer avec Google' : 'S’inscrire avec Google'}
          accessibilityState={{ disabled: isAnySocialLoading || isLoading, busy: isGoogleLoading }}
          activeOpacity={0.8}
        >
          {isGoogleLoading ? (
            <><ActivityIndicator color="#4285F4" /><Text style={styles.googleButtonText}>Connexion en cours…</Text></>
          ) : (
            <>
              <Image 
                source={require('@/assets/images/google.png')} 
                style={styles.googleIcon}
              />
              <Text style={[styles.googleButtonText, simple.buttonText]}>
                {mode === 'login' ? 'Continuer avec Google' : 'S\'inscrire avec Google'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {showAppleAuth && (
          isAppleLoading ? (
            <View style={styles.appleButtonLoading}>
              <ActivityIndicator color="#000000" />
              <Text style={styles.appleButtonLoadingText}>Connexion Apple...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.appleFallbackButton, simple.button, isGoogleLoading && { opacity: 0.7 }]}
              onPress={handleAppleAuthPress}
              disabled={isAnySocialLoading || isLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-apple" size={20} color="#000000" />
              <Text style={[styles.appleFallbackButtonText, simple.buttonText]}>{appleButtonLabel}</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <Text style={[styles.legalText, simple.legal]}>
        En continuant, vous acceptez nos{' '}
        <Text style={styles.legalLink}>Conditions d&apos;Utilisation</Text>
        {' '}et notre{' '}
        <Text style={styles.legalLink}>Politique de Confidentialité</Text>.
      </Text>
    </Animated.View>
  );
}
