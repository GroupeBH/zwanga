import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';

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
}: PhoneStepProps) {
  const phoneDigits = phone.replace(/\D/g, '');
  const displayPhone = phoneDigits.startsWith('243') ? phoneDigits.slice(3) : phoneDigits;
  const isPhoneValid = phoneDigits.length >= 12;
  const showAppleAuth = Platform.OS === 'ios' && isAppleAvailable && onAppleAuth;
  const isAnySocialLoading = isGoogleLoading || isAppleLoading;
  const appleButtonLabel = mode === 'login' ? 'Continuer avec Apple' : 'S\'inscrire avec Apple';
  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '');

    if (!digits) {
      onPhoneChange('');
      return;
    }

    if (digits.startsWith('243')) {
      onPhoneChange(`+${digits.slice(0, 12)}`);
      return;
    }

    if (digits.startsWith('0')) {
      onPhoneChange(`+243${digits.slice(1, 10)}`);
      return;
    }

    onPhoneChange(`+243${digits.slice(0, 9)}`);
  };

  const handleAppleAuthPress = () => {
    if (!isAnySocialLoading) {
      onAppleAuth?.();
    }
  };

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={[styles.stepContainer, styles.phoneStepContainer]}>
      <View style={styles.brandHero}>
        <View style={styles.brandIcon}>
          <Ionicons name="car-sport" size={42} color={Colors.primaryDark} />
        </View>
        <Text style={styles.brandName}>Zwanga</Text>
      </View>

      <View style={styles.introBlock}>
        <Text style={styles.introTitle}>
          {mode === 'login' ? 'Bon retour !' : 'Rejoignez Zwanga'}
        </Text>
        <Text style={styles.introSubtitle}>La mobilité simplifiée, pour tous.</Text>
      </View>

      <View style={styles.authCard}>
        <Text style={styles.inputLabel}>Numéro de téléphone</Text>
        <View style={styles.phoneInputShell}>
          <View style={styles.countryPrefix}>
            <Ionicons name="flag-outline" size={22} color={Colors.gray[500]} />
            <Text style={styles.countryPrefixText}>+243</Text>
          </View>
          <TextInput
            style={styles.phoneTextInput}
            placeholder="000 000 000"
            placeholderTextColor="#DDBEB3"
            keyboardType="phone-pad"
            value={displayPhone}
            onChangeText={handlePhoneChange}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.mainButton,
            isPhoneValid && !isLoading ? styles.mainButtonActive : styles.mainButtonDisabled,
          ]}
          onPress={onSubmit}
          disabled={!isPhoneValid || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={styles.mainButtonText}>Continuer</Text>
              <Ionicons name="arrow-forward" size={22} color="white" />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OU</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={[styles.googleButton, isAnySocialLoading && { opacity: 0.7 }]}
          onPress={onGoogleAuth}
          disabled={isAnySocialLoading}
          activeOpacity={0.8}
        >
          {isGoogleLoading ? (
            <ActivityIndicator color="#4285F4" />
          ) : (
            <>
              <Image 
                source={require('@/assets/images/google.png')} 
                style={styles.googleIcon}
              />
              <Text style={styles.googleButtonText}>
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
              style={[styles.appleFallbackButton, isGoogleLoading && { opacity: 0.7 }]}
              onPress={handleAppleAuthPress}
              disabled={isAnySocialLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-apple" size={20} color="#000000" />
              <Text style={styles.appleFallbackButtonText}>{appleButtonLabel}</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <Text style={styles.legalText}>
        En continuant, vous acceptez nos{' '}
        <Text style={styles.legalLink}>Conditions d&apos;Utilisation</Text>
        {' '}et notre{' '}
        <Text style={styles.legalLink}>Politique de Confidentialité</Text>.
      </Text>
    </Animated.View>
  );
}
