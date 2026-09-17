import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import { styles } from '@/features/profile/ProfilePinModal.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'currentUser'
  | 'handleForgotPin'
  | 'handleNewPinChange'
  | 'handleNewPinConfirmChange'
  | 'handleOldPinChange'
  | 'handleOtpInputChange'
  | 'handleOtpKeyPress'
  | 'handleUpdatePin'
  | 'handleVerifyOldPin'
  | 'handleVerifyOtpForPinChange'
  | 'isSendingOtp'
  | 'isUpdatingPin'
  | 'isUpdatingPinWithOtp'
  | 'newPin'
  | 'newPinConfirm'
  | 'oldPin'
  | 'oldPinInputRef'
  | 'otpCode'
  | 'otpInputRefs'
  | 'pinConfirmInputRef'
  | 'pinInputRef'
  | 'pinModalVisible'
  | 'pinStep'
  | 'setPinModalVisible'
>;

export function ProfilePinModal({
  currentUser,
  handleForgotPin,
  handleNewPinChange,
  handleNewPinConfirmChange,
  handleOldPinChange,
  handleOtpInputChange,
  handleOtpKeyPress,
  handleUpdatePin,
  handleVerifyOldPin,
  handleVerifyOtpForPinChange,
  isSendingOtp,
  isUpdatingPin,
  isUpdatingPinWithOtp,
  newPin,
  newPinConfirm,
  oldPin,
  oldPinInputRef,
  otpCode,
  otpInputRefs,
  pinConfirmInputRef,
  pinInputRef,
  pinModalVisible,
  pinStep,
  setPinModalVisible,
}: Props) {
  return (<Modal
    visible={pinModalVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setPinModalVisible(false)}
  >
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pinModalOverlay}>
      <Animated.View entering={FadeInDown} style={styles.pinModalCard}>
        <View style={styles.pinModalHeader}>
          <Text style={styles.pinModalTitle}>Modifier le code PIN</Text>
          <TouchableOpacity onPress={() => setPinModalVisible(false)}>
            <Ionicons name="close" size={24} color={Colors.gray[500]} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: Spacing.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {pinStep === 'oldPin' ? (
            <>
              <Text style={styles.pinModalSubtitle}>
                Entrez votre mot de passe PIN actuel pour confirmer votre identité
              </Text>
              <View style={styles.formSection}>
                <Text style={styles.inputLabel}>Mot de passe PIN actuel</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                  <TextInput
                    ref={oldPinInputRef}
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={oldPin}
                    onChangeText={handleOldPinChange}
                    placeholder="Entrez votre PIN actuel (4 chiffres)"
                    placeholderTextColor={Colors.gray[400]}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.pinModalButton,
                  oldPin.length === 4 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled,
                ]}
                onPress={handleVerifyOldPin}
                disabled={oldPin.length !== 4}
              >
                <Text style={styles.pinModalButtonText}>Continuer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pinModalForgotButton} onPress={handleForgotPin}>
                <Text style={styles.pinModalForgotText}>{"J'ai oublié mon PIN"}</Text>
              </TouchableOpacity>
            </>
          ) : pinStep === 'otp' ? (
            <>
              <Text style={styles.pinModalSubtitle}>
                Un code de vérification a été envoyé au{' '}
                <Text style={{ fontWeight: 'bold' }}>{currentUser?.phone}</Text>
              </Text>
              <View style={styles.formSection}>
                <Text style={styles.inputLabel}>Code de vérification (OTP)</Text>
                <Text style={styles.inputLabelSmall}>6 chiffres reçus par SMS</Text>
                <View style={styles.smsCodeContainer}>
                  {otpCode.map((digit, index) => (
                    <TextInput
                      key={`otp-${index}`}
                      ref={(ref) => {
                        otpInputRefs.current[index] = ref;
                      }}
                      style={[styles.smsInput, digit ? styles.smsInputFilled : null]}
                      keyboardType="number-pad"
                      maxLength={otpCode.length}
                      textContentType="oneTimeCode"
                      autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                      value={digit}
                      onChangeText={(text) => handleOtpInputChange(text, index)}
                      onKeyPress={(e) => handleOtpKeyPress(e, index)}
                    />
                  ))}
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.pinModalButton,
                  otpCode.join('').length === 6 ? styles.pinModalButtonActive : styles.pinModalButtonDisabled,
                ]}
                onPress={handleVerifyOtpForPinChange}
                disabled={otpCode.join('').length !== 6 || isSendingOtp || isUpdatingPinWithOtp}
              >
                {isUpdatingPinWithOtp
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.pinModalButtonText}>Vérifier</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pinModalResendButton}
                onPress={handleForgotPin}
                disabled={isSendingOtp || isUpdatingPinWithOtp}
              >
                {isSendingOtp ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Text style={styles.pinModalResendText}>Renvoyer le code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.pinModalSubtitle}>Créez un nouveau mot de passe PIN à 4 chiffres</Text>
              <View style={styles.formSection}>
                <Text style={styles.inputLabel}>Nouveau mot de passe PIN</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                  <TextInput
                    ref={pinInputRef}
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={newPin}
                    onChangeText={handleNewPinChange}
                    placeholder="Créez un nouveau PIN (4 chiffres)"
                    placeholderTextColor={Colors.gray[400]}
                  />
                </View>
              </View>
              <View style={styles.formSection}>
                <Text style={styles.inputLabel}>Confirmer le nouveau mot de passe PIN</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
                  <TextInput
                    ref={pinConfirmInputRef}
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    value={newPinConfirm}
                    onChangeText={handleNewPinConfirmChange}
                    placeholder="Confirmez votre nouveau PIN (4 chiffres)"
                    placeholderTextColor={Colors.gray[400]}
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.pinModalButton,
                  newPin.length === 4 && newPinConfirm.length === 4
                    ? styles.pinModalButtonActive
                    : styles.pinModalButtonDisabled,
                ]}
                onPress={handleUpdatePin}
                disabled={
                  newPin.length !== 4 || newPinConfirm.length !== 4 || isUpdatingPin || isUpdatingPinWithOtp
                }
              >
                {isUpdatingPin || isUpdatingPinWithOtp ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.pinModalButtonText}>Modifier le PIN</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>);
}
