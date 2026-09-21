import { styles } from '../screen-styles/app/trip/detail/index';
import { PoliceContactPanel } from '@/components/PoliceContactPanel';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface TripSosModalProps {
  sosModalVisible: boolean;
  closeSosModal: () => void;
  insets: EdgeInsets;
}

export function TripSosModal({
  sosModalVisible,
  closeSosModal,
  insets,
}: TripSosModalProps) {
  return (
    <Modal
      priority={100}
      visible={sosModalVisible}
      animationType="slide"
      transparent
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={closeSosModal}
    >
      <View style={styles.securityModalOverlay}>
        <TouchableOpacity
          style={styles.securityModalBackdrop}
          activeOpacity={1}
          onPress={closeSosModal}
        />
        <View
          style={[
            styles.sosModalContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
        >
          <View style={styles.securityModalHeader}>
            <View style={styles.securityModalHeaderCopy}>
              <View style={styles.sosModalTitleRow}>
                <View style={styles.sosModalIcon}>
                  <Ionicons name="call" size={18} color={Colors.danger} />
                </View>
                <Text style={styles.securityModalTitle}>SOS</Text>
              </View>
              <Text style={styles.securityModalSubtitle}>
                En cas de danger immédiat, choisissez un numéro d’urgence à appeler.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.securityModalCloseButton}
              onPress={closeSosModal}
            >
              <Ionicons name="close" size={22} color={Colors.gray[700]} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.securityModalBody}
            contentContainerStyle={styles.securityModalBodyContent}
            showsVerticalScrollIndicator={false}
          >
            <PoliceContactPanel />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
