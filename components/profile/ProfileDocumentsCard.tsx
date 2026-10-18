import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileDocumentsCard.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'handleOpenDocumentsPack'
  | 'needsDriverOnboarding'
  | 'openingDocumentsPack'
>;

export function ProfileDocumentsCard({
  handleOpenDocumentsPack,
  openingDocumentsPack,
}: Props) {
  return (
    <View>
      <View style={styles.documentPackCard}>
        <View style={styles.documentPackHeader}>
          <View style={styles.documentPackIcon}>
            <Ionicons name="documents-outline" size={22} color={Colors.info} />
          </View>
          <View style={styles.documentPackContent}>
            <Text style={styles.documentPackTitle}>Zwanga Services</Text>
            <Text style={styles.documentPackSubtitle}>
              Démarches et solutions pour votre activité professionnelle.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.documentPackButton}
          onPress={handleOpenDocumentsPack}
          disabled={openingDocumentsPack}
          activeOpacity={0.85}
        >
          {openingDocumentsPack ? (
            <ActivityIndicator color={Colors.info} />
          ) : (
            <>
              <Text style={styles.documentPackButtonText}>Découvrir les services pro</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.info} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
