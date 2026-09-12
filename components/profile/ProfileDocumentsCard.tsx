import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileDocumentsCard.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
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
  needsDriverOnboarding,
  openingDocumentsPack,
}: Props) {
  return (!needsDriverOnboarding && (
    <Animated.View entering={FadeInDown.delay(300)}>
      <View style={styles.documentPackCard}>
        <View style={styles.documentPackHeader}>
          <View style={styles.documentPackIcon}>
            <Ionicons name="documents-outline" size={22} color={Colors.info} />
          </View>
          <View style={styles.documentPackContent}>
            <Text style={styles.documentPackTitle}>Pack documents véhicule</Text>
            <Text style={styles.documentPackSubtitle}>
              Continuez sur le site Zwanga pour les documents nécessaires au véhicule.
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
              <Text style={styles.documentPackButtonText}>Continuer sur le site</Text>
              <Ionicons name="open-outline" size={16} color={Colors.info} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  ));
}
