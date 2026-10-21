import { styles } from '../screen-styles/app/trip/navigate/detail/index';
import { Colors } from '@/constants/styles';
import { ACTION_COLORS } from '@/constants/actionColors';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { RideModal as Modal } from '@/features/navigation/RideModal';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackgroundLocationConsent } from '@/components/location/BackgroundLocationConsent';

interface NavigationLocationDisclosureProps {
  backgroundDisclosureVisible: boolean;
  resolveBackgroundDisclosure: (accepted: boolean) => void;
}

export function NavigationLocationDisclosure({
  backgroundDisclosureVisible,
  resolveBackgroundDisclosure,
}: NavigationLocationDisclosureProps) {
  const [consent, setConsent] = useState(false);
  useEffect(() => { setConsent(false); }, [backgroundDisclosureVisible]);
  const resolve = (accepted: boolean) => {
    if (accepted && !consent) return;
    setConsent(false);
    resolveBackgroundDisclosure(accepted);
  };
  return (
    <Modal
      visible={backgroundDisclosureVisible}
      transparent
      animationType="fade"
      onRequestClose={() => resolve(false)}
    >
      <View style={styles.backgroundDisclosureOverlay}>
        <ScrollView style={local.card} contentContainerStyle={styles.backgroundDisclosureCard}>
          <View style={styles.backgroundDisclosureIcon}>
            <Ionicons name="location" size={24} color={Colors.primary} />
          </View>
          <Text style={styles.backgroundDisclosureTitle}>
            Rester visible pendant le trajet
          </Text>
          <Text style={styles.backgroundDisclosureText}>
            Même si l’écran s’éteint, Zwanga collecte et envoie votre position au serveur pour que vos passagers puissent vous suivre.
          </Text>
          <Text style={styles.backgroundDisclosureText}>Le partage avec vos passagers s’arrête à la fin du trajet.</Text>
          <BackgroundLocationConsent checked={consent} onChange={setConsent} />
          <Text style={styles.backgroundDisclosureText}>
            {`Ensuite, confirmez sur le téléphone en choisissant ${Platform.OS === 'ios' ? '« Toujours »' : '« Toujours autoriser »'}.`}
          </Text>
          <Text style={styles.backgroundDisclosureFootnote}>
            Vous pouvez refuser et continuer. Le suivi fonctionnera seulement quand l’application est ouverte.
          </Text>
          <View style={local.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: !consent }}
              disabled={!consent}
              style={[local.primary, !consent && local.disabled]}
              onPress={() => resolve(true)}
            >
              <Text style={styles.backgroundDisclosurePrimaryButtonText}>Autoriser et continuer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={local.decline}
              onPress={() => resolve(false)}
            >
              <Text style={styles.backgroundDisclosureSecondaryButtonText}>Pas maintenant</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  card: { maxHeight: '90%', flexGrow: 0, width: '100%', borderRadius: 24, backgroundColor: Colors.white },
  actions: { gap: 8 },
  primary: { minHeight: 52, padding: 14, borderRadius: 16, backgroundColor: ACTION_COLORS.orange,
    justifyContent: 'center', alignItems: 'center' },
  disabled: { opacity: 0.45 },
  decline: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
});
