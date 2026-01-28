import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { KycFiles } from '../types';

interface KycStepProps {
  kycFiles: KycFiles | null;
  onOpenKycModal: () => void;
  onFinish: () => void;
  isLoading: boolean;
}

export function KycStep({
  kycFiles,
  onOpenKycModal,
  onFinish,
  isLoading,
}: KycStepProps) {
  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <View style={[styles.logoContainer, { backgroundColor: Colors.info + '15' }]}>
          <Ionicons name="shield-checkmark" size={48} color={Colors.info} />
        </View>
        <Text style={styles.heroTitle}>Vérification d'identité requise</Text>
        <Text style={styles.heroSubtitle}>
          Pour devenir conducteur, vous devez vérifier votre identité.
        </Text>
      </View>

      <View style={styles.kycBenefitsContainer}>
        <View style={styles.benefitRow}>
          <Ionicons name="checkbox" size={24} color={Colors.success} style={{ marginBottom: 2 }} />
          <Text style={styles.benefitText}>Badge "Vérifié" sur votre profil</Text>
        </View>
        <View style={styles.benefitRow}>
          <Ionicons name="flash" size={24} color={Colors.warning} style={{ marginBottom: 2 }} />
          <Text style={styles.benefitText}>Accès prioritaire aux trajets</Text>
        </View>
        <View style={styles.benefitRow}>
          <Ionicons name="heart" size={24} color={Colors.danger} style={{ marginBottom: 2 }} />
          <Text style={styles.benefitText}>Plus de confiance des membres</Text>
        </View>
      </View>

      <View style={{ gap: 16 }}>
        <TouchableOpacity
          style={[
            styles.mainButton,
            kycFiles ? styles.mainButtonActive : { backgroundColor: Colors.primary + '20' },
          ]}
          onPress={onOpenKycModal}
        >
          <Text style={[styles.mainButtonText, !kycFiles && { color: Colors.primary }]}>
            {kycFiles ? 'Documents scannés (Modifier)' : 'Scanner mes documents'}
          </Text>
          <Ionicons
            name={kycFiles ? 'checkmark-circle' : 'scan'}
            size={20}
            color={kycFiles ? 'white' : Colors.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.mainButton,
            styles.mainButtonActive,
            { backgroundColor: kycFiles ? Colors.success : Colors.primary },
          ]}
          onPress={onFinish}
          disabled={isLoading || !kycFiles}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={styles.mainButtonText}>
                {kycFiles ? "Terminer l'inscription" : 'KYC requis pour les conducteurs'}
              </Text>
              {kycFiles && <Ionicons name="arrow-forward" size={20} color="white" />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

