import { Colors, Spacing } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileScreen.styles';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export function ProfileStatusNotice({ hasSnapshot, needsUpdate = false, busy, onRetry, onLogout }: {
  hasSnapshot: boolean;
  needsUpdate?: boolean;
  busy: boolean;
  onRetry: () => void;
  onLogout?: () => void;
}) {
  if (hasSnapshot) return (
    <View accessibilityLiveRegion="polite" style={{ marginHorizontal: Spacing.xl, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <Text style={{ flex: 1, color: Colors.gray[600], fontSize: 13 }}>
        {needsUpdate ? 'Le parcours conducteur est temporairement indisponible.' : 'Connexion instable · Dernier statut conservé'}
      </Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Réessayer le chargement du profil"
        accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onRetry}
        style={{ paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm }}>
        {busy ? <ActivityIndicator color={Colors.primary} /> : <Text style={{ color: Colors.primaryDark }}>Réessayer</Text>}
      </TouchableOpacity>
    </View>
  );
  return (
    <View style={{ padding: Spacing.xl }} accessibilityLiveRegion="polite">
      <Text style={styles.profileLoadingTitle}>
        Profil indisponible
      </Text>
      <Text style={styles.profileLoadingMessage}>
        Impossible de confirmer votre statut auprès du serveur. Vérifiez votre connexion puis réessayez.
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Réessayer le chargement du profil"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onRetry}
        style={{ padding: Spacing.lg, alignItems: 'center' }}
      >
        {busy ? <ActivityIndicator color={Colors.primary} /> :
          <Text style={{ color: Colors.primaryDark, fontWeight: '600' }}>Réessayer</Text>}
      </TouchableOpacity>
      {onLogout && (
        <TouchableOpacity accessibilityRole="button" onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Déconnexion</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
