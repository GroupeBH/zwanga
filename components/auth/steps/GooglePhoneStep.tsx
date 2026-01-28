import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';

interface GooglePhoneStepProps {
  profileName: string | null;
  phone: string;
  onPhoneChange: (phone: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function GooglePhoneStep({
  profileName,
  phone,
  onPhoneChange,
  onSubmit,
  onCancel,
  isLoading,
}: GooglePhoneStepProps) {
  const isPhoneValid = phone.length >= 10;

  return (
    <Animated.View
      key="google-phone-step"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.stepContainer}
    >
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: '#4285F420' }]}>
          <Ionicons name="logo-google" size={40} color="#4285F4" />
        </View>
        <Text style={styles.heroTitle}>Inscription Google</Text>
        <Text style={styles.heroSubtitle}>
          {profileName ? `Bienvenue ${profileName} !` : 'Connectez votre numéro de téléphone'}
        </Text>
      </View>

      <View style={styles.formSection}>
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
            autoFocus
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
              <Text style={styles.mainButtonText}>Recevoir le code</Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
          <Ionicons name="arrow-back" size={18} color={Colors.primary} />
          <Text style={styles.secondaryButtonText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

