import { styles } from '../screen-styles/app/publish/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PublishIdentityModalProps {
  kycModalVisible: boolean;
  closeKycModal: () => void;
  kycChecklist: readonly [{ readonly icon: "shield-checkmark"; readonly title: "Didit sécurisé"; readonly subtitle: "Vérification hébergée par Didit"; }, { readonly icon: "id-card"; readonly title: "Pièce d'identité"; readonly subtitle: "Contrôle guidé depuis le parcours Didit"; }, { readonly icon: "time"; readonly title: "Validation rapide"; readonly subtitle: "Suivi automatique de votre vérification"; }];
  insets: EdgeInsets;
  isKycBusy: boolean;
  handleStartKyc: () => Promise<void>;
}

export function PublishIdentityModal({
  kycModalVisible,
  closeKycModal,
  kycChecklist,
  insets,
  isKycBusy,
  handleStartKyc,
}: PublishIdentityModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={kycModalVisible}
      onRequestClose={closeKycModal}
    >
      <View style={styles.kycModalOverlay}>
        <Animated.View entering={FadeInDown} style={styles.kycModalCard}>
          <View style={styles.kycModalHero}>
            <View style={styles.kycModalBadge}>
              <Ionicons name="shield-checkmark" size={28} color={Colors.white} />
            </View>
            <Text style={styles.kycModalTitle}>Vérification requise</Text>
            <Text style={styles.kycModalSubtitle}>
              Publiez vos trajets en toute confiance en confirmant votre identité. Celà prend
              moins de 5 minutes et protège la communauté.
            </Text>
          </View>

          <View style={styles.kycModalHighlights}>
            <View style={styles.kycHighlight}>
              <Ionicons name="flash" size={18} color={Colors.success} />
              <Text style={styles.kycHighlightText}>Validation rapide</Text>
            </View>
            <View style={styles.kycHighlight}>
              <Ionicons name="lock-closed" size={18} color={Colors.primary} />
              <Text style={styles.kycHighlightText}>Données protégées</Text>
            </View>
          </View>

          <View style={styles.kycChecklist}>
            {kycChecklist.map((item) => (
              <View key={item.title} style={styles.kycChecklistItem}>
                <View style={styles.kycChecklistIcon}>
                  <Ionicons name={item.icon} size={18} color={Colors.primary} />
                </View>
                <View style={styles.kycChecklistContent}>
                  <Text style={styles.kycChecklistTitle}>{item.title}</Text>
                  <Text style={styles.kycChecklistSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.kycModalActions, { paddingBottom: Math.max(insets.bottom, 0) }]}>
            <TouchableOpacity
              style={[styles.kycPrimaryButton, isKycBusy && styles.kycPrimaryButtonDisabled]}
              onPress={handleStartKyc}
              disabled={isKycBusy}
            >
              {isKycBusy ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Text style={styles.kycPrimaryButtonText}>Commencer avec Didit</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.kycSecondaryButton} onPress={closeKycModal}>
              <Text style={styles.kycSecondaryButtonText}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
