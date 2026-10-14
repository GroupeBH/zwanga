import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/styles';
import { getProfileStatus } from '@/features/profile/profileStatusModel';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { displayReadOptions, useDisplayReadData, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useAppSelector } from '@/store/hooks';

/** Mounted after ownership is checked, before driver controllers start their work. */
export function ManageTripIdentityGuard({ children }: React.PropsWithChildren) {
  const router = useRouter();
  const userId = useAppSelector(state => state.auth.user?.id) ?? '';
  const { kycDocument } = useIdentityCheck();
  const active = useScreenIsActive();
  const readsEnabled = useDisplayReadsEnabled(active) && Boolean(userId);
  const { currentData, isLoading, isFetching, refetch } = useGetProfileSummaryQuery(undefined,
    displayReadOptions(readsEnabled));
  const profile = useDisplayReadData(userId, currentData);
  const status = getProfileStatus(profile, userId);
  const refresh = useDisplayRefetch(readsEnabled, userId, refetch);

  // Preserve offline access from an actual server document for this account,
  // never a local auth flag. A known profile decision always takes precedence.
  const approvedDocument = Boolean(userId && kycDocument?.userId === userId && kycDocument.status === 'approved');
  if (status.isIdentityStatusKnown ? status.isKycApproved : approvedDocument) return <>{children}</>;

  const checking = !status.isIdentityStatusKnown && Boolean(isLoading || isFetching);
  const pending = status.isIdentityStatusKnown && status.isKycPending;
  const unknown = !status.isIdentityStatusKnown;
  const retry = unknown || pending;
  const busy = Boolean(isFetching);
  const title = checking ? 'Chargement du profil…' : unknown ? 'Profil indisponible'
    : pending ? 'Vérification en cours' : 'Identité à vérifier';
  const message = checking ? 'Nous vérifions vos informations.'
    : unknown ? 'Impossible de lire votre statut. Vérifiez Internet puis réessayez.'
    : pending ? 'Votre identité est en cours de vérification. Aucun document à renvoyer.'
    : 'Vérifiez votre identité pour gérer vos trajets.';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {checking ? <ActivityIndicator size="large" color={Colors.primary} />
            : <Ionicons name={unknown ? 'cloud-offline-outline' : 'shield-outline'} size={40} color={Colors.primary} />}
          <Text style={styles.title} accessibilityLiveRegion="polite">{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={retry && (!readsEnabled || busy)}
            accessibilityState={{ disabled: retry && (!readsEnabled || busy), busy: retry && busy }}
            style={[styles.button, retry && (!readsEnabled || busy) && styles.disabled]}
            onPress={() => {
              if (retry) { if (readsEnabled && !busy) void refresh(); }
              else router.push('/profile');
            }}>
            <Text style={styles.buttonText}>{retry ? busy ? 'Chargement…' : 'Réessayer' : 'Vérifier mon identité'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.homeButton}
            onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.homeText}>Retour à l’accueil</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray[50] },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.gray[900], textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 23, color: Colors.gray[600], textAlign: 'center' },
  button: { minHeight: 52, width: '100%', borderRadius: 16, backgroundColor: Colors.primary,
    paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', color: Colors.white, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  homeButton: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  homeText: { fontSize: 16, fontWeight: '600', color: Colors.gray[700], textAlign: 'center' },
});
