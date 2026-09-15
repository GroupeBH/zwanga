import { styles } from '../screen-styles/app/trip/detail/index';
import { Colors } from '@/constants/styles';
import { openWhatsApp } from '@/utils/phoneHelpers';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import type { Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { useDialog } from '@/components/ui/DialogProvider';

interface TripContactModalProps {
  contactModalVisible: boolean;
  setContactModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  trip: Trip | undefined;
  driverPhone: string | null;
  showDialog: ReturnType<typeof useDialog>['showDialog'];
}

export function TripContactModal({
  contactModalVisible,
  setContactModalVisible,
  insets,
  trip,
  driverPhone,
  showDialog,
}: TripContactModalProps) {
  return (
    <Modal
      visible={contactModalVisible}
      animationType="fade"
      transparent
      onRequestClose={() => setContactModalVisible(false)}
    >
      <TouchableOpacity
        style={styles.contactModalOverlay}
        activeOpacity={1}
        onPress={() => setContactModalVisible(false)}
      >
        <Animated.View entering={FadeInDown} style={[styles.contactModalCard, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]} onStartShouldSetResponder={() => true}>
          <View style={styles.contactModalHeader}>
            <View style={styles.contactModalIconWrapper}>
              <View style={styles.contactModalIconBadge}>
                <Ionicons name="logo-whatsapp" size={32} color="#25D366" />
              </View>
            </View>
            <Text style={styles.contactModalTitle}>
              Contacter {trip?.driverName || 'le conducteur'}
            </Text>
            <Text style={styles.contactModalSubtitle}>
              Contact via WhatsApp uniquement
            </Text>
          </View>

          <View style={styles.contactModalActions}>
            <TouchableOpacity
              style={[styles.contactModalButton, styles.contactModalButtonWhatsApp]}
              onPress={async () => {
                setContactModalVisible(false);
                await openWhatsApp(driverPhone!, (errorMsg) => {
                  showDialog({
                    variant: 'danger',
                    title: 'Erreur',
                    message: errorMsg,
                  });
                });
              }}
            >
              <View style={styles.contactModalButtonIcon}>
                <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              </View>
              <View style={styles.contactModalButtonContent}>
                <Text style={styles.contactModalButtonTitle}>WhatsApp</Text>
                <Text style={styles.contactModalButtonSubtitle}>Envoyer un message WhatsApp</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.contactModalCancelButton}
            onPress={() => setContactModalVisible(false)}
          >
            <Text style={styles.contactModalCancelText}>Annuler</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}
