import React from 'react';
import { OtpCodeInput } from '../OtpCodeInput';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { AuthMode } from '../types';
import { OtpDeliveryNotice } from '../OtpDeliveryNotice';

interface SmsStepProps {
  mode: AuthMode;
  phone: string;
  smsCode: string[];
  smsInputRefs: React.MutableRefObject<(TextInput | null)[]>;
  onSmsCodeChange: (code: string[]) => void;
  onSubmit: () => void;
  onResend: () => void;
  isVerifying: boolean;
  isResending: boolean;
}

export function SmsStep({
  mode,
  phone,
  smsCode,
  smsInputRefs,
  onSmsCodeChange,
  onSubmit,
  onResend,
  isVerifying,
  isResending,
}: SmsStepProps) {
  const isCodeComplete = smsCode.join('').length === 5;

  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.secondary + '20' }]}>
          <Ionicons name="chatbubble-ellipses" size={40} color={Colors.secondary} />
        </View>
        <Text style={styles.heroTitle}>Vérification</Text>
        <Text style={styles.heroSubtitle}>
          Numéro à vérifier :{' '}
          <Text style={{ fontWeight: 'bold', color: Colors.gray[900] }}>{phone}</Text>
        </Text>
      </View>

      <View style={styles.formSection}>
        <OtpDeliveryNotice />
        <Text style={styles.inputLabel}>Code de vérification</Text>
        <Text style={styles.inputLabelSmall}>Saisissez les 5 chiffres du code reçu</Text>
        <OtpCodeInput code={smsCode} onChange={onSmsCodeChange} inputRefs={smsInputRefs}
          disabled={isVerifying || isResending} containerStyle={styles.smsCodeContainer}
          inputStyle={styles.smsInput} filledStyle={styles.smsInputFilled} />
      </View>

      <TouchableOpacity
        style={[
          styles.mainButton,
          isCodeComplete ? styles.mainButtonActive : styles.mainButtonDisabled,
        ]}
        onPress={onSubmit}
        disabled={!isCodeComplete || isVerifying}
      >
        {isVerifying ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Text style={styles.mainButtonText}>
              {mode === 'login' ? 'Se connecter' : 'Vérifier'}
            </Text>
            <Ionicons name="checkmark-circle-outline" size={24} color="white" />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resendButton}
        onPress={onResend}
        disabled={isResending}
      >
        {isResending ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={styles.resendButtonText}>Renvoyer le code</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

