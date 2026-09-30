import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';
import { otpDeliveryCopy } from '@/features/auth/otpDelivery';
import { AuthCodeHeading } from '../AuthCodeHeading';
import { authCodeStyles as codeStyles } from '@/features/auth/authCode.styles';

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
  keyboardVisible?: boolean;
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
  keyboardVisible = false,
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
      disabled={isLoading}
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
        editable={!isLoading}
      />
      <View style={[styles.pinCodeContainer, compact && styles.pinCodeContainerCompact, !isSignup && codeStyles.pinRow]} pointerEvents="none">
        {pinSlots.map((slot) => (
          <View
            key={`${accessibilityLabel}-${slot}`}
            style={[
              styles.pinInput,
              compact && styles.pinInputCompact,
              !isSignup && codeStyles.pinBox,
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
      style={[styles.stepContainer, isSignup ? styles.pinSignupStepContainer : codeStyles.step]}
    >
      {isSignup ? <View style={[styles.pinHeroSection, styles.pinHeroSectionCompact]}>
        <View style={[styles.secureIllustration, styles.secureIllustrationCompact]}>
          <View style={[styles.secureRing, styles.secureRingCompact]} />
          <View style={[styles.secureConnector, styles.secureConnectorCompact]} />
          <View style={[styles.secureTile, styles.secureTileCompact]}>
            <Ionicons name="lock-closed" size={30} color={Colors.white} />
          </View>
        </View>
        <Text style={[styles.heroTitle, styles.pinSignupTitle]}>
          Créez votre mot de passe PIN
        </Text>
        <Text style={[styles.heroSubtitle, styles.pinSignupSubtitle]}>
          Choisissez 4 chiffres, puis confirmez-les.
        </Text>
      </View> : <AuthCodeHeading title="Votre code PIN" subtitle="La connexion démarre dès la saisie des 4 chiffres."
        icon="lock-closed-outline" keyboardVisible={keyboardVisible} />}

      {mode === 'login' ? (
        // Mode login : un seul champ PIN
        <>
          {renderPinInput(pin, pinInputRef, onPinChange, 'Code PIN à 4 chiffres')}

          <View style={codeStyles.actions}>
            <TouchableOpacity
              style={[
                styles.mainButton,
                codeStyles.action,
                isValid ? styles.mainButtonActive : styles.mainButtonDisabled,
              ]}
              onPress={onSubmit}
              disabled={!isValid || isLoading}
              accessibilityRole="button"
              accessibilityLabel={isLoading ? 'Connexion en cours' : 'Se connecter'}
              accessibilityState={{ disabled: !isValid || isLoading, busy: isLoading }}
            >
              {isLoading ? (
                <><ActivityIndicator color="white" /><Text style={[styles.mainButtonText, codeStyles.actionText]}>Connexion en cours…</Text></>
              ) : (
                <Text style={[styles.mainButtonText, codeStyles.actionText]}>Se connecter</Text>
              )}
            </TouchableOpacity>
            {onForgotPin && (
              <TouchableOpacity style={[codeStyles.action, codeStyles.secondaryAction]} onPress={onForgotPin} disabled={isLoading}
                accessibilityRole="button" accessibilityLabel="J’ai oublié mon PIN" accessibilityState={{ disabled: isLoading }}>
                <Text style={codeStyles.secondaryText}>PIN oublié ?</Text>
              </TouchableOpacity>
            )}
          </View>
          {onForgotPin && <Text style={codeStyles.help}>{otpDeliveryCopy.forgotPinHint}</Text>}
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
