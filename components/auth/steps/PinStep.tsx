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
import { PasswordCodeInput } from '../PasswordCodeInput';

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
  error?: string | null;
  phone?: string;
  onChangePhone?: () => void;
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
  error,
  phone,
  onChangePhone,
}: PinStepProps) {
  const isLoginValid = mode === 'login' && pin.length === 4;
  const isSignupValid = mode === 'signup' && pin.length === 4 && pinConfirm.length === 4;
  const isValid = mode === 'login' ? isLoginValid : isSignupValid;
  const isSignup = mode === 'signup';

  const renderPinInput = (
    value: string,
    inputRef: React.RefObject<TextInput | null>,
    onChangeText: (pin: string) => void,
    accessibilityLabel: string,
    compact = false
  ) => (
    <PasswordCodeInput value={value} inputRef={inputRef} onChange={onChangeText}
      label={accessibilityLabel} compact={compact} login={!isSignup} disabled={isLoading}
      error={!isSignup ? error : null} />
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
          Créez votre mot de passe
        </Text>
        <Text style={[styles.heroSubtitle, styles.pinSignupSubtitle]}>
          Choisissez quatre chiffres, puis saisissez-les à nouveau.
        </Text>
      </View> : <AuthCodeHeading title="Votre mot de passe" subtitle="Quatre chiffres. La connexion démarre au dernier chiffre."
        icon="lock-closed-outline" keyboardVisible={keyboardVisible} />}

      {mode === 'login' ? (
        // Mode login : un seul champ PIN
        <>
          {phone && <View>
            <Text style={codeStyles.phone}>{phone}</Text>
            {onChangePhone && <TouchableOpacity style={codeStyles.changePhone} onPress={onChangePhone}
              disabled={isLoading} accessibilityRole="button" accessibilityState={{ disabled: isLoading }}>
              <Text style={codeStyles.secondaryText}>Changer de numéro</Text>
            </TouchableOpacity>}
          </View>}
          {renderPinInput(pin, pinInputRef, onPinChange, 'Mot de passe à quatre chiffres')}
          {error && <Text style={codeStyles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}

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
                accessibilityRole="button" accessibilityLabel="J’ai oublié mon mot de passe" accessibilityState={{ disabled: isLoading }}>
                <Text style={codeStyles.secondaryText}>Mot de passe oublié ?</Text>
              </TouchableOpacity>
            )}
          </View>
          {onForgotPin && <Text style={codeStyles.help}>{otpDeliveryCopy.forgotPinHint}</Text>}
        </>
      ) : (
        // Mode signup : deux champs PIN (création et confirmation)
        <View style={styles.pinSignupForm}>
          <View style={[styles.formSection, styles.pinSignupField]}>
            <Text style={[styles.inputLabel, styles.pinSignupLabel]}>Mot de passe à quatre chiffres</Text>
            {renderPinInput(pin, pinInputRef, onPinChange, 'Nouveau mot de passe à quatre chiffres', true)}
          </View>

          <View style={[styles.formSection, styles.pinSignupField]}>
            <Text style={[styles.inputLabel, styles.pinSignupLabel]}>Saisissez les mêmes chiffres</Text>
            {renderPinInput(pinConfirm, pinConfirmInputRef, onPinConfirmChange, 'Confirmation du mot de passe à quatre chiffres', true)}
          </View>

          <TouchableOpacity
            style={[
              styles.mainButton,
              styles.pinSignupButton,
              isValid ? styles.mainButtonActive : styles.mainButtonDisabled,
            ]}
            onPress={onSubmit}
            disabled={!isValid || isLoading}
          >
            <Text style={styles.mainButtonText}>Continuer</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}
