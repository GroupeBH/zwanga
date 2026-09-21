import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { Text, TouchableOpacity, View } from 'react-native';

interface NavigationLocationDisclosureProps {
  backgroundDisclosureVisible: boolean;
  resolveBackgroundDisclosure: (accepted: boolean) => void;
}

export function NavigationLocationDisclosure({
  backgroundDisclosureVisible,
  resolveBackgroundDisclosure,
}: NavigationLocationDisclosureProps) {
  return (
    <Modal
      visible={backgroundDisclosureVisible}
      transparent
      animationType="fade"
      onRequestClose={() => resolveBackgroundDisclosure(false)}
    >
      <View style={styles.backgroundDisclosureOverlay}>
        <View style={styles.backgroundDisclosureCard}>
          <View style={styles.backgroundDisclosureIcon}>
            <Ionicons name="location" size={24} color={Colors.primary} />
          </View>
          <Text style={styles.backgroundDisclosureTitle}>
            Autorisation de localisation en arrière-plan
          </Text>
          <Text style={styles.backgroundDisclosureText}>
            {"Zwanga collecte votre position même quand l'application est en arrière-plan pendant un trajet actif."}
          </Text>
          <View style={styles.backgroundDisclosureList}>
            <Text style={styles.backgroundDisclosureItem}>
              - Suivre votre trajet en continu pour la navigation GPS.
            </Text>
            <Text style={styles.backgroundDisclosureItem}>
              - Envoyer votre position au serveur et aux passagers du trajet en cours.
            </Text>
            <Text style={styles.backgroundDisclosureItem}>
              - Arreter automatiquement le suivi à la fin du trajet.
            </Text>
          </View>
          <Text style={styles.backgroundDisclosureFootnote}>
            {"Vous pouvez continuer sans cette autorisation. Dans ce cas, le suivi fonctionne uniquement quand l'application est ouverte."}
          </Text>
          <View style={styles.backgroundDisclosureActions}>
            <TouchableOpacity
              style={styles.backgroundDisclosureSecondaryButton}
              onPress={() => resolveBackgroundDisclosure(false)}
            >
              <Text style={styles.backgroundDisclosureSecondaryButtonText}>Pas maintenant</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backgroundDisclosurePrimaryButton}
              onPress={() => resolveBackgroundDisclosure(true)}
            >
              <Text style={styles.backgroundDisclosurePrimaryButtonText}>Continuer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
