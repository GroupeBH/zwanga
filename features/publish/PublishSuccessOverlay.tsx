import { usePublishController } from '../../hooks/publish/usePublishController';
import { styles } from '../screen-styles/app/publish/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface PublishSuccessOverlayProps {
  model: ReturnType<typeof usePublishController>;
}

export function PublishSuccessOverlay({
  model,
}: PublishSuccessOverlayProps) {
  return (
    <View style={styles.publicationSuccessOverlay}>
      <View style={styles.publicationSuccessCard}>
        <View style={styles.publicationSuccessIcon}>
          <Ionicons name="checkmark" size={38} color={Colors.white} />
        </View>
        <Text style={styles.publicationSuccessTitle}>
          {model.publicationSuccess?.recurring ? 'Trajets programmés' : 'Trajet publié'}
        </Text>
        <Text style={styles.publicationSuccessMessage}>
          {model.publicationSuccess?.recurring
            ? 'Vos trajets ont bien été programmés pour les jours sélectionnés.'
            : 'Votre trajet a bien été publié. Il est maintenant visible par les passagers.'}
        </Text>
        <TouchableOpacity
          style={styles.publicationSuccessPrimaryButton}
          onPress={() => model.finishPublicationSuccess('home')}
        >
          <Text style={styles.publicationSuccessPrimaryText}>Retour à l’accueil</Text>
        </TouchableOpacity>
        <View style={styles.publicationSuccessSecondaryRow}>
          <TouchableOpacity
            style={styles.publicationSuccessSecondaryButton}
            onPress={() => model.finishPublicationSuccess('another')}
          >
            <Text style={styles.publicationSuccessSecondaryText}>Publier un autre</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.publicationSuccessSecondaryButton}
            onPress={() => model.finishPublicationSuccess('trips')}
          >
            <Text style={styles.publicationSuccessSecondaryText}>Mes trajets</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
