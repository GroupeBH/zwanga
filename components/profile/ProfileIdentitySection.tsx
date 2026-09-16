import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileDashboard.styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  approved: boolean;
  pending: boolean;
  rejected: boolean;
  busy: boolean;
  onPress: () => void;
};

export const ProfileIdentitySection = React.memo(function ProfileIdentitySection({ approved, pending, rejected, busy, onPress }: Props) {
  const status = approved ? 'Identité vérifiée' : pending ? 'Vérification en cours' : rejected ? 'Vérification à reprendre' : 'Identité non vérifiée';
  return (
    <View style={styles.identitySection}>
      <View style={styles.identityHeading}>
        <Ionicons name="shield-checkmark-outline" size={20} color={approved ? Colors.success : Colors.primary} />
        <Text style={styles.identityTitle}>{status}</Text>
      </View>
      <Text style={styles.identityHint}>
        Pour les passagers comme pour les conducteurs. Aucun véhicule requis pour vérifier votre identité.
      </Text>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress} style={styles.identityAction} activeOpacity={0.8}>
        {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : (
          <>
            <Text style={styles.identityActionText}>{approved || pending ? 'Voir ma vérification' : 'Vérifier mon identité'}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
});
