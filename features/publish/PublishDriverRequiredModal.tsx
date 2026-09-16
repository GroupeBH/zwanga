import { usePublishController } from '../../hooks/publish/usePublishController';
import { styles } from '../screen-styles/app/publish/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface PublishDriverRequiredModalProps {
  model: ReturnType<typeof usePublishController>;
}

export function PublishDriverRequiredModal({
  model,
}: PublishDriverRequiredModalProps) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={model.vehicle.showDriverRequiredModal}
      onRequestClose={() => model.vehicle.setShowDriverRequiredModal(false)}
    >
      <View style={styles.driverModalOverlay}>
        <Animated.View entering={FadeInDown} style={styles.driverModalCard}>
          <View style={styles.driverModalIcon}>
            <Ionicons name="car" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.driverModalTitle}>Compte conducteur requis</Text>
          <Text style={styles.driverModalMessage}>
            Pour publier des trajets, vous devez d&apos;abord activer votre compte conducteur et ajouter un véhicule dans votre profil.
          </Text>
          <View style={[styles.driverModalButtons, { paddingBottom: Math.max(model.insets.bottom, 0) }]}>
            <TouchableOpacity
              style={[styles.driverModalButton, styles.driverModalButtonSecondary]}
              onPress={() => {
                model.vehicle.setShowDriverRequiredModal(false);
                model.router.back();
              }}
            >
              <Text style={styles.driverModalButtonSecondaryText}>Retour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.driverModalButton, styles.driverModalButtonPrimary]}
              onPress={() => {
                model.vehicle.setShowDriverRequiredModal(false);
                model.router.push({
                  pathname: '/profile',
                  params: { openDriverOnboarding: '1' },
                } as any);
              }}
            >
              <Text style={styles.driverModalButtonPrimaryText}>Devenir conducteur</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
