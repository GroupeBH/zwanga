import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';
import { otpDeliveryCopy } from '@/features/auth/otpDelivery';
import { AuthCodeHeading } from '../AuthCodeHeading';
import { authCodeStyles as codeStyles } from '@/features/auth/authCode.styles';
import { PasswordCodeInput } from '../PasswordCodeInput';
import { authSimpleStyles as simple } from '@/features/auth/authSimple.styles';

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
      label={accessibilityLabel} compact={compact} newPassword={isSignup} disabled={isLoading}
      error={!isSignup ? error : null} />
  );

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOutUp}
      style={[codeStyles.step, keyboardVisible && codeStyles.keyboardStep]}
    >
      <AuthCodeHeading title={isSignup ? 'Créez votre mot de passe' : 'Votre mot de passe'}
        subtitle={isSignup ? 'Choisissez 4 chiffres à retenir.' : 'Vos 4 chiffres, pas le code SMS. Connexion au dernier chiffre.'}
        icon="lock-closed-outline" keyboardVisible={keyboardVisible} />

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
            <Text style={simple.label}>Mot de passe · 4 chiffres</Text>
            {renderPinInput(pin, pinInputRef, onPinChange, 'Nouveau mot de passe à quatre chiffres', true)}
          </View>

          <View style={[styles.formSection, styles.pinSignupField]}>
            <Text style={simple.label}>Répétez le mot de passe</Text>
            {renderPinInput(pinConfirm, pinConfirmInputRef, onPinConfirmChange, 'Confirmation du mot de passe à quatre chiffres', true)}
          </View>

          <TouchableOpacity
            style={[
              styles.mainButton,
              styles.pinSignupButton,
              isValid ? styles.mainButtonActive : styles.mainButtonDisabled,
              simple.button,
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
