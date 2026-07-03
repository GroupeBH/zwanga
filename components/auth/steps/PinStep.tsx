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
  const isSignup = mode === 'signup';
  const pinSlots = [0, 1, 2, 3];

  const renderPinInput = (
    value: string,
    inputRef: React.RefObject<TextInput | null>,
    onChangeText: (pin: string) => void,
    accessibilityLabel: string,
    compact = false
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
      <View style={[styles.pinCodeContainer, compact && styles.pinCodeContainerCompact]} pointerEvents="none">
        {pinSlots.map((slot) => (
          <View
            key={`${accessibilityLabel}-${slot}`}
            style={[
              styles.pinInput,
              compact && styles.pinInputCompact,
              value[slot] ? styles.pinInputFilled : null,
            ]}
          >
            <Text style={[
              styles.pinDot,
              compact && styles.pinDotCompact,
              value[slot] ? styles.pinDotFilled : styles.pinDotEmpty,
            ]}>
              •
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOutUp}
      style={[styles.stepContainer, isSignup && styles.pinSignupStepContainer]}
    >
      <View style={[styles.pinHeroSection, isSignup && styles.pinHeroSectionCompact]}>
        <View style={[styles.secureIllustration, isSignup && styles.secureIllustrationCompact]}>
          <View style={[styles.secureRing, isSignup && styles.secureRingCompact]} />
          <View style={[styles.secureConnector, isSignup && styles.secureConnectorCompact]} />
          <View style={[styles.secureTile, isSignup && styles.secureTileCompact]}>
            <Ionicons name="lock-closed" size={isSignup ? 30 : 48} color={Colors.white} />
          </View>
        </View>
        <Text style={[styles.heroTitle, isSignup && styles.pinSignupTitle]}>
          {mode === 'login' ? 'Entrez votre mot de passe PIN' : 'Créez votre mot de passe PIN'}
        </Text>
        <Text style={[styles.heroSubtitle, isSignup && styles.pinSignupSubtitle]}>
          {mode === 'login'
            ? 'Mot de passe PIN à 4 chiffres'
            : 'Choisissez 4 chiffres, puis confirmez-les.'}
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
        <View style={styles.pinSignupForm}>
          <View style={[styles.formSection, styles.pinSignupField]}>
            <Text style={[styles.inputLabel, styles.pinSignupLabel]}>Mot de passe PIN</Text>
            {renderPinInput(pin, pinInputRef, onPinChange, 'Nouveau code PIN à 4 chiffres', true)}
          </View>

          <View style={[styles.formSection, styles.pinSignupField]}>
            <Text style={[styles.inputLabel, styles.pinSignupLabel]}>Confirmer le PIN</Text>
            {renderPinInput(pinConfirm, pinConfirmInputRef, onPinConfirmChange, 'Confirmation du code PIN à 4 chiffres', true)}
          </View>

          <TouchableOpacity
            style={[
              styles.mainButton,
              styles.pinSignupButton,
              isValid ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onSubmit}
            disabled={!isValid}
          >
            <Text style={styles.mainButtonText}>Continuer</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}
