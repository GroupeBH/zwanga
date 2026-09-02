import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';

interface KycStepProps {
  onFinish: () => void;
  onEditIdentity?: () => void;
  isLoading: boolean;
  firstName: string;
  lastName: string;
}

export function KycStep({
  onFinish,
  onEditIdentity,
  isLoading,
  firstName,
  lastName,
}: KycStepProps) {
  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.info + '15' }]}>
          <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
        </View>
        <Text style={styles.heroTitle}>Vérification d’identité requise</Text>
        <Text style={styles.heroSubtitle}>
          Pour devenir conducteur, vous devez vérifier votre identité avec Didit.
        </Text>
      </View>

      <View style={styles.kycBenefitsContainer}>
        <View style={styles.benefitRow}>
          <Ionicons name="shield-checkmark" size={24} color={Colors.success} style={{ marginBottom: 2 }} />
          <Text style={styles.benefitText}>Vérification sécurisée par Didit</Text>
        </View>
        <View style={styles.benefitRow}>
          <Ionicons name="flash" size={24} color={Colors.warning} style={{ marginBottom: 2 }} />
          <Text style={styles.benefitText}>Contrôle d’identité rapide et guidé</Text>
        </View>
        <View style={styles.benefitRow}>
          <Ionicons name="heart" size={24} color={Colors.danger} style={{ marginBottom: 2 }} />
          <Text style={styles.benefitText}>Plus de confiance des membres</Text>
        </View>
      </View>

      <View style={styles.kycIdentityCard}>
        <Text style={styles.kycIdentityEyebrow}>IDENTITÉ À CONTRÔLER</Text>
        <Text style={styles.kycIdentityLabel}>Prénom(s)</Text>
        <Text style={styles.kycIdentityValue}>{firstName}</Text>
        <Text style={styles.kycIdentityLabel}>Nom</Text>
        <Text style={styles.kycIdentityValue}>{lastName}</Text>
        <Text style={styles.kycIdentityHint}>
          Ces informations doivent correspondre à votre pièce d’identité. Le post-nom est facultatif.
        </Text>
        {onEditIdentity ? (
          <TouchableOpacity
            style={styles.kycIdentityEditButton}
            onPress={onEditIdentity}
            disabled={isLoading}
          >
            <Ionicons name="pencil-outline" size={17} color={Colors.primary} />
            <Text style={styles.kycIdentityEditText}>Modifier mes noms</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ gap: 16 }}>
        <TouchableOpacity
          style={[styles.mainButton, styles.mainButtonActive, { backgroundColor: Colors.primary }]}
          onPress={onFinish}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={styles.mainButtonText}>
                Confirmer et vérifier avec Didit
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
