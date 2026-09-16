import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';

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
  profileName,
  provider = 'google',
  phone,
  onPhoneChange,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel = 'Recevoir le code',
}: GooglePhoneStepProps) {
  const isPhoneValid = phone.length >= 10;
  const providerName = provider === 'apple' ? 'Apple' : 'Google';
  const providerIcon = provider === 'apple' ? 'logo-apple' : 'logo-google';
  const providerColor = provider === 'apple' ? '#111827' : '#4285F4';

  return (
    <Animated.View
      key="google-phone-step"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.stepContainer}
    >
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: `${providerColor}20` }]}>
          <Ionicons name={providerIcon} size={40} color={providerColor} />
        </View>
        <Text style={styles.heroTitle}>Inscription {providerName}</Text>
        <Text style={styles.heroSubtitle}>
          {profileName ? `Bienvenue ${profileName} !` : 'Connectez votre numéro de téléphone'}
        </Text>
      </View>

      <View style={styles.authCard}>
        <Text style={styles.inputLabel}>Numéro de téléphone</Text>
        <Text style={styles.inputLabelSmall}>Ce numéro sera associé à votre compte</Text>

        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="+243 000 000 000"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={onPhoneChange}
            autoFocus={Platform.OS !== 'android'}
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
              <Text style={styles.mainButtonText}>{submitLabel}</Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Ionicons name="arrow-back" size={18} color={Colors.primaryDark} />
          <Text style={styles.secondaryButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

