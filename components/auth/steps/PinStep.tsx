import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
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
  const pinSlots = [0, 1, 2, 3];

  const renderPinInput = (
    value: string,
    inputRef: React.RefObject<TextInput | null>,
    onChangeText: (pin: string) => void,
    accessibilityLabel: string
  ) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.pinEntryContainer}
      onPress={() => inputRef.current?.focus()}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <TextInput
        ref={inputRef}
        style={styles.pinHiddenInput}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        value={value}
        onChangeText={onChangeText}
        textContentType="password"
        autoComplete="off"
      />
      <View style={styles.pinCodeContainer} pointerEvents="none">
        {pinSlots.map((slot) => (
          <View
            key={`${accessibilityLabel}-${slot}`}
            style={[styles.pinInput, value[slot] ? styles.pinInputFilled : null]}
          >
            <Text style={styles.pinDot}>{value[slot] ? '•' : ''}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

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
          {renderPinInput(pin, pinInputRef, onPinChange, 'Code PIN à 4 chiffres')}

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
              <Text style={styles.forgotPinText}>{"J'ai oublié mon PIN"}</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        // Mode signup : deux champs PIN (création et confirmation)
        <>
          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Mot de passe PIN</Text>
            {renderPinInput(pin, pinInputRef, onPinChange, 'Nouveau code PIN à 4 chiffres')}
          </View>

          <View style={styles.formSection}>
            <Text style={styles.inputLabel}>Confirmer le mot de passe PIN</Text>
            {renderPinInput(pinConfirm, pinConfirmInputRef, onPinConfirmChange, 'Confirmation du code PIN à 4 chiffres')}
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
