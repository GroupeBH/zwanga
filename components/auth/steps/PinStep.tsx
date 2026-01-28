import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';

interface PinStepProps {
  mode: AuthMode;
  pin: string;
  pinConfirm: string;
  pinInputRef: React.RefObject<TextInput | null>;
  pinConfirmInputRef: React.RefObject<TextInput | null>;
  onPinChange: (pin: string) => void;
  onPinConfirmChange: (pinConfirm: string) => void;
  onSubmit: () => void;
  onForgotPin?: () => void;
  isLoading: boolean;
}

export function PinStep({
  mode,
  pin,
  pinConfirm,
  pinInputRef,
  pinConfirmInputRef,
  onPinChange,
  onPinConfirmChange,
  onSubmit,
  onForgotPin,
  isLoading,
}: PinStepProps) {
  const isLoginValid = mode === 'login' && pin.length === 4;
  const isSignupValid = mode === 'signup' && pin.length === 4 && pinConfirm.length === 4;
  const isValid = mode === 'login' ? isLoginValid : isSignupValid;

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.primary + '20' }]}>
          <Ionicons name="lock-closed" size={40} color={Colors.primary} />
        </View>
        <Text style={styles.heroTitle}>
          {mode === 'login' ? 'Entrez votre mot de passe PIN' : 'Créez votre mot de passe PIN'}
        </Text>
        <Text style={styles.heroSubtitle}>
          {mode === 'login'
            ? 'Mot de passe PIN à 4 chiffres'
            : 'Choisissez un mot de passe PIN à 4 chiffres pour sécuriser votre compte'}
        </Text>
      </View>

      {mode === 'login' ? (
        // Mode login : un seul champ PIN
        <>
          <View style={styles.pinInputWrapper}>
            <Ionicons name="lock-closed" size={18} color={Colors.gray[500]} style={styles.pinInputIcon} />
            <TextInput
              ref={pinInputRef}
              style={styles.pinInputField}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              value={pin}
              onChangeText={onPinChange}
              placeholder="••••"
              placeholderTextColor={Colors.gray[400]}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.mainButton,
              isValid ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onSubmit}
            disabled={!isValid || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Text style={styles.mainButtonText}>Se connecter</Text>
                <Ionicons name="checkmark-circle-outline" size={24} color="white" />
              </>
            )}
          </TouchableOpacity>

          {onForgotPin && (
            <TouchableOpacity style={styles.forgotPinButton} onPress={onForgotPin}>
              <Text style={styles.forgotPinText}>J'ai oublié mon PIN</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        // Mode signup : deux champs PIN (création et confirmation)
        <>
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Mot de passe PIN</Text>
            <View style={styles.pinInputWrapper}>
              <Ionicons name="lock-closed" size={18} color={Colors.gray[500]} style={styles.pinInputIcon} />
              <TextInput
                ref={pinInputRef}
                style={styles.pinInputField}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={pin}
                onChangeText={onPinChange}
                placeholder="••••"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Confirmer le mot de passe PIN</Text>
            <View style={styles.pinInputWrapper}>
              <Ionicons name="lock-closed" size={18} color={Colors.gray[500]} style={styles.pinInputIcon} />
              <TextInput
                ref={pinConfirmInputRef}
                style={styles.pinInputField}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                value={pinConfirm}
                onChangeText={onPinConfirmChange}
                placeholder="••••"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.mainButton,
              isValid ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onSubmit}
            disabled={!isValid}
          >
            <Text style={styles.mainButtonText}>Continuer</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

