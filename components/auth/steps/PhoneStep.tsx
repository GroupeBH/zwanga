import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
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
  isLoading: boolean;
  isGoogleLoading: boolean;
}

export function PhoneStep({
  mode,
  phone,
  onPhoneChange,
  onSubmit,
  onGoogleAuth,
  isLoading,
  isGoogleLoading,
}: PhoneStepProps) {
  const isPhoneValid = phone.length >= 10;

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={styles.logoContainer}>
          <Ionicons name="car-sport" size={50} color={Colors.primary} />
        </View>
        <Text style={styles.heroTitle}>
          {mode === 'login' ? 'Bon retour !' : 'Rejoignez Zwanga'}
        </Text>
        <Text style={styles.heroSubtitle}>La mobilité simplifiée, pour tous.</Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.inputLabel}>Numéro de téléphone</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="+243 000 000 000"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={onPhoneChange}
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
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>

        {/* Google auth */}
        <TouchableOpacity
          style={[styles.googleButton, isGoogleLoading && { opacity: 0.7 }]}
          onPress={onGoogleAuth}
          disabled={isGoogleLoading}
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
      </View>
    </Animated.View>
  );
}

