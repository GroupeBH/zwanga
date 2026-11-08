import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/styles';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useGetDispatchOfferQuery } from '@/store/api/driverDispatchApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { inviteAcceptedRequestContact } from '@/store/slices/rideEntrySlice';
import { dismissDriverInvitation } from '@/services/driverNotifications';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { isInvitationId } from './driverInvitation';

/** Resolve an old offer link, never accept it without the request's vehicle picker. */
export function IncomingDispatchRedirect() {
  const { id, kind, driverId } = useLocalSearchParams<{ id?: string; kind?: string; driverId?: string }>();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const active = useScreenIsActive();
  const userId = useAppSelector(state => state.auth.user?.id);
  const validId = isInvitationId(id) ? id : '';
  const wrongRecipient = Boolean(driverId && driverId !== userId);
  const enabled = Boolean(active && userId && validId && kind === 'dispatch' && !wrongRecipient);
  const query = useGetDispatchOfferQuery(validId, { skip: !enabled, refetchOnMountOrArgChange: true });
  // data can still belong to the previous argument. Only the fresh, matching offer
  // identifies the request; no request ID or decision is trusted from the URL.
  const offer = query.currentData;
  const authorized = Boolean(userId && offer?.id === validId && offer.driverId === userId &&
    isInvitationId(offer.requestId) && offer.request?.id === offer.requestId);
  const redirected = useRef('');
  const scope = `${userId}:${validId}`;

  useEffect(() => {
    if (!enabled || !authorized || !offer || query.isFetching || query.isLoading || query.isError ||
        redirected.current === scope) return;
    redirected.current = scope;
    const invitation = { kind: 'dispatch' as const, id: validId, driverId: userId! };
    if (offer.actionable === false || offer.status === 'accepted' || offer.status === 'declined') {
      void dismissDriverInvitation(invitation).catch(() => {});
    }
    // Recover a confirmed native action on cold start, without submitting it again.
    if (offer.status === 'accepted') dispatch(inviteAcceptedRequestContact({ userId: userId!, requestId: offer.requestId }));
    if (offer.status === 'declined') { router.replace('/(tabs)'); return; }
    // An expired alert does not necessarily close the command. Its regular detail
    // rechecks availability, vehicle, schedule and the current assignment.
    router.replace(getTripRequestDetailHref(offer.requestId));
  }, [authorized, dispatch, enabled, offer, query.isError, query.isFetching, query.isLoading, router, scope, userId, validId]);

  const loading = enabled && (query.isFetching || query.isLoading || authorized) && !query.isError;
  const unavailable = query.isError && query.error && 'status' in query.error &&
    [403, 404, 410].includes(Number(query.error.status));
  return <SafeAreaView style={styles.screen}>
    <View style={styles.content}>
      {loading && <ActivityIndicator color={Colors.primary} />}
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {loading ? 'Ouverture de la commande…' : query.isError && !unavailable
          ? 'Impossible de charger la commande. Vérifiez votre connexion.'
          : 'Cette commande n’est pas disponible pour votre compte.'}
      </Text>
      {!loading && query.isError && !unavailable && enabled && <TouchableOpacity accessibilityRole="button" style={styles.button}
        onPress={() => { void query.refetch().catch(() => {}); }}><Text style={styles.buttonText}>Réessayer</Text></TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
        redirected.current = scope; // A late read must not undo this explicit exit.
        router.replace('/(tabs)');
      }}>
        <Text style={styles.buttonText}>Retour à l’accueil</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white, justifyContent: 'center' },
  content: { padding: 24, gap: 16, alignItems: 'center' },
  message: { fontSize: 16, color: Colors.gray[700], textAlign: 'center' },
  button: { minHeight: 44, padding: 12, justifyContent: 'center' },
  buttonText: { color: Colors.primaryDark, fontSize: 16, fontWeight: '600' },
});
