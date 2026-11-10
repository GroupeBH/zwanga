import type { usePublishController } from '@/hooks/publish/usePublishController';
import { styles } from '../screen-styles/app/publish/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export function PublishSuccessOverlay({ model }: { model: ReturnType<typeof usePublishController> }) {
  return <View style={styles.publicationSuccessOverlay} accessibilityViewIsModal>
    <View style={styles.publicationSuccessCard}>
      <Ionicons name="checkmark-circle" size={44} color={Colors.success} />
      <Text style={styles.publicationSuccessTitle}>
        {model.publicationSuccess?.recurring ? 'Trajets programmés' : 'Trajet publié'}
      </Text>
      {model.publicationRedirect.failed ? <>
        <Text style={styles.publicationSuccessMessage}>Votre trajet est enregistré.</Text>
        <TouchableOpacity style={styles.publicationSuccessPrimaryButton} accessibilityRole="button"
          onPress={model.publicationRedirect.retry}>
          <Text style={styles.publicationSuccessPrimaryText}>Ouvrir mon trajet</Text>
        </TouchableOpacity>
      </> : <>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.publicationSuccessMessage} accessibilityLiveRegion="polite">
          {model.publicationSuccess?.recurring ? 'Ouverture de vos trajets réguliers…' : 'Ouverture de votre trajet…'}
        </Text>
      </>}
    </View>
  </View>;
}
