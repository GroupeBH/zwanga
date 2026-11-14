import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { authSimpleStyles as simple } from '@/features/auth/authSimple.styles';
import { AuthCodeHeading } from '../AuthCodeHeading';

interface KycStepProps {
  onFinish: () => void;
  onEditIdentity?: () => void;
  isLoading: boolean;
  hasCreatedAccount?: boolean;
  firstName: string;
  lastName: string;
}

export function KycStep({
  onFinish,
  onEditIdentity,
  isLoading,
  hasCreatedAccount = false,
  firstName,
  lastName,
}: KycStepProps) {
  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={simple.step}>
      <AuthCodeHeading title="Vérifiez votre identité" icon="lock-closed-outline"
        subtitle="Obligatoire avant de conduire sur Zwanga." />
      <Text style={simple.subtitle}>Préparez votre pièce d’identité. Didit vous guide pour la vérification.</Text>

      <View style={simple.identity}>
        <Text style={simple.label}>Nom sur votre pièce d’identité</Text>
        <Text style={simple.identityName}>{firstName} {lastName}</Text>
        {onEditIdentity ? (
          <TouchableOpacity
            style={[styles.kycIdentityEditButton, simple.edit]}
            onPress={onEditIdentity}
            disabled={isLoading || hasCreatedAccount}
          >
            <Ionicons name="pencil-outline" size={17} color={Colors.primary} />
            <Text style={styles.kycIdentityEditText}>Modifier mes noms</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ gap: 16 }}>
        <TouchableOpacity
          style={[styles.mainButton, styles.mainButtonActive, simple.button]}
          onPress={onFinish}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
        >
          {isLoading ? (
            <>
              <ActivityIndicator color="white" />
              <Text style={styles.mainButtonText}>Finalisation en cours…</Text>
            </>
          ) : (
            <>
              <Text style={[styles.mainButtonText, simple.buttonText]}>
                {hasCreatedAccount ? 'Finaliser la connexion' : 'Vérifier mon identité'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
