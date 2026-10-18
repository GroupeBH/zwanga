import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileDashboard.styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  approved: boolean;
  pending: boolean;
  rejected: boolean;
  known: boolean;
  busy: boolean;
  onPress: () => void;
};

export const ProfileIdentitySection = React.memo(function ProfileIdentitySection({ approved, pending, rejected, known, busy, onPress }: Props) {
  const status = !known ? 'Statut d’identité indisponible' : approved ? 'Identité vérifiée' : pending ? 'Vérification en cours' : rejected ? 'Vérification à reprendre' : 'Identité non vérifiée';
  return (
    <View style={styles.identitySection}>
      <View style={styles.identityHeading}>
        <Ionicons name="shield-checkmark-outline" size={20} color={approved ? Colors.success : Colors.primary} />
        <Text style={styles.identityTitle}>{status}</Text>
      </View>
      <Text style={styles.identityHint}>
        Pour réserver 3 places ou plus en tant que passager. Cette vérification ne vous engage pas à devenir conducteur.
      </Text>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={styles.identityAction} activeOpacity={0.8}>
        {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : (
          <>
            <Text style={styles.identityActionText}>{!known ? 'Actualiser le statut' : approved || pending ? 'Voir ma vérification' : 'Vérifier mon identité'}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});
