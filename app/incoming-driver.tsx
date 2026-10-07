import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGetCurrentUserQuery } from '@/store/api/userApi';
import { useGetBookingByIdQuery } from '@/store/api/bookingApi';
import { useGetDispatchOfferQuery, useRespondToDispatchOfferMutation, useRespondToBookingInvitationMutation } from '@/store/api/driverDispatchApi';
import { consumeDriverAction, dismissDriverInvitation } from '@/services/driverNotifications';
import { isInvitationId, type DriverDecision, type DriverInvitation } from '@/features/notifications/driverInvitation';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Colors } from '@/constants/styles';

export default function IncomingDriverScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  return <IncomingDriverContent key={`${params.kind}:${params.id}`} />;
}

function IncomingDriverContent() {
  const params = useLocalSearchParams<{ id?: string; kind?: string; driverId?: string; actionEvent?: string }>();
  const router = useRouter();
  const active = useScreenIsActive();
  const { data: user } = useGetCurrentUserQuery();
  const id = isInvitationId(params.id) ? params.id : '';
  const kind = params.kind === 'booking' ? 'booking' : params.kind === 'dispatch' ? 'dispatch' : null;
  const offer = useGetDispatchOfferQuery(id, { skip: !id || kind !== 'dispatch' || !active, refetchOnMountOrArgChange: true });
  const booking = useGetBookingByIdQuery(id, { skip: !id || kind !== 'booking' || !active, refetchOnMountOrArgChange: true });
  const refetchOffer = offer.refetch;
  const refetchBooking = booking.refetch;
  const [respondBooking] = useRespondToBookingInvitationMutation();
  const [respond] = useRespondToDispatchOfferMutation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DriverDecision | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const consumed = useRef(false);
  useEffect(() => { consumed.current = false; }, [id, params.actionEvent]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const localDeadline = useMemo(() => offer.data ? Date.now() + Date.parse(offer.data.expiresAt) - Date.parse(offer.data.serverNow) : 0, [offer.data]);
  const remaining = Math.max(0, Math.ceil((localDeadline - now) / 1000));
  const driverId = kind === 'dispatch' ? offer.data?.driverId : booking.data?.trip?.driverId;
  const invitation = useMemo<DriverInvitation | null>(() => kind && id && driverId ? { kind, id, driverId } : null, [kind, id, driverId]);
  useEffect(() => () => {
    if (invitation) void dismissDriverInvitation(invitation).catch(() => {});
  }, [invitation]);
  const loading = kind === 'dispatch' ? offer.isFetching : booking.isFetching;
  const authorized = Boolean(user?.id && driverId === user.id);
  const actionable = authorized && !loading && (kind === 'dispatch'
    ? offer.data?.actionable && remaining > 0
    : booking.data?.status === 'pending');
  const details = kind === 'dispatch' && offer.data ? offer.data.request : booking.data ? {
    passengerName: booking.data.passengerName || 'Un passager',
    departure: booking.data.passengerOrigin || booking.data.trip?.departure.address || '',
    arrival: booking.data.passengerDestination || booking.data.trip?.arrival.address || '',
    seats: booking.data.numberOfSeats, pricePerSeat: booking.data.trip?.price ?? 0,
    paymentMode: booking.data.paymentMode || 'cash',
  } : null;

  const answer = useCallback(async (decision: DriverDecision) => {
    if (!invitation || !actionable || inFlight.current || done) return;
    inFlight.current = true; setBusy(true); setError('');
    void dismissDriverInvitation(invitation).catch(() => {});
    try {
      if (invitation.kind === 'dispatch') await respond({ id, decision }).unwrap();
      else await respondBooking({ id, accept: decision === 'accept' }).unwrap();
      if (mounted.current) setDone(decision);
      void dismissDriverInvitation(invitation).catch(() => {});
    } catch (cause) {
      if (mounted.current) setError(getApiErrorMessage(cause, 'Votre réponse n’a pas pu être confirmée. Vérifiez la connexion puis réessayez.'));
      // Reconcile an ambiguous result; never queue a later automatic acceptance.
      if (kind === 'dispatch') void refetchOffer(); else void refetchBooking();
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [invitation, actionable, done, respond, id, respondBooking, kind, refetchOffer, refetchBooking]);

  useEffect(() => {
    if (!active || !invitation || !user?.id || !authorized || loading || consumed.current) return;
    consumed.current = true;
    void consumeDriverAction(invitation, user.id).then(decision => {
      if (decision && mounted.current) return answer(decision);
    }).catch(() => setError('Touchez Accepter ou Refuser pour confirmer votre choix.'));
  }, [active, invitation, user?.id, authorized, loading, answer, params.actionEvent]);

  const openDetails = () => {
    if (kind === 'dispatch' && offer.data) router.replace(getTripRequestDetailHref(offer.data.requestId));
    else if (booking.data) router.replace({ pathname: '/trip/manage/[id]', params: { id: booking.data.tripId } });
    else router.replace('/(tabs)');
  };
  const failedRead = Boolean(kind === 'dispatch' ? offer.error : booking.error);
  return <SafeAreaView style={styles.screen}>
    <View style={styles.top}>
      <Text style={styles.eyebrow}>{kind === 'dispatch' ? 'PROPOSITION À PROXIMITÉ' : 'NOUVELLE RÉSERVATION'}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer la proposition" disabled={busy} style={styles.close}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
        <Ionicons name="close" size={26} color={Colors.gray[700]} />
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.icon, done === 'accept' && styles.successIcon]}>
        <Ionicons name={done === 'accept' ? 'checkmark' : done === 'decline' ? 'close' : 'car-outline'} size={42} color={done === 'accept' ? Colors.successDark : Colors.primary} />
      </View>
      <Text style={styles.title}>{done === 'accept' ? 'C’est confirmé !' : done === 'decline' ? 'Proposition refusée' : 'Un passager vous attend'}</Text>
      <Text style={styles.copy}>{done === 'accept' ? 'Le passager a été informé. Retrouvez la prise en charge dans les détails.'
        : done === 'decline' ? kind === 'dispatch' ? 'La recherche peut continuer avec un autre conducteur.' : 'Le passager sera informé de votre réponse.'
        : kind === 'dispatch' ? 'Acceptez uniquement si vous pouvez assurer cette prise en charge.' : 'Votre réponse concerne uniquement cette réservation.'}</Text>
      {loading && !details ? <ActivityIndicator size="large" color={Colors.primary} /> : null}
      {authorized && details && <>
        <Text style={styles.passenger}>{details.passengerName} · {details.seats} place{details.seats > 1 ? 's' : ''}</Text>
        {kind === 'dispatch' && offer.data?.vehicleName && <Text style={styles.copy}>Votre véhicule : {offer.data.vehicleName}</Text>}
        <View style={styles.route}>
          <Text style={styles.routeLabel}>DÉPART</Text><Text style={styles.address}>{details.departure}</Text>
          <View style={styles.separator} />
          <Text style={styles.routeLabel}>DESTINATION</Text><Text style={styles.address}>{details.arrival}</Text>
        </View>
        <View style={styles.fare}><Text style={styles.amount}>{Number(details.pricePerSeat).toLocaleString('fr-FR')} FC <Text style={styles.copy}>/ place</Text></Text>
          <Text style={styles.copy}>{details.paymentMode === 'cash' ? 'Cash à l’arrivée' : details.paymentMode === 'tokens' ? 'Jetons Zwanga' : 'Paiement électronique'}</Text>
        </View>
        {kind === 'booking' && booking.data?.trip?.departureTime && <Text style={styles.copy}>Départ : {new Date(booking.data.trip.departureTime).toLocaleString('fr-FR')}</Text>}
      </>}
      {!done && kind === 'dispatch' && authorized && <Text style={styles.countdown} accessibilityLiveRegion="polite">{remaining > 0 && offer.data?.actionable ? `${remaining} s pour répondre` : 'Cette proposition n’est plus disponible'}</Text>}
      {failedRead && <TouchableOpacity style={styles.retry} onPress={() => { if (kind === 'dispatch') void offer.refetch(); else void booking.refetch(); }}>
        <Text style={styles.copy}>Impossible de vérifier la proposition. Touchez pour réessayer.</Text>
      </TouchableOpacity>}
      {!loading && !failedRead && (!authorized || !kind || !id) && <Text style={styles.error}>Cette proposition n’est pas disponible pour votre compte.</Text>}
      {!done && kind === 'booking' && authorized && !loading && booking.data?.status !== 'pending' && <Text style={styles.copy}>Cette réservation a déjà été traitée.</Text>}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>
    <View style={styles.footer}>
      {done || (!actionable && !loading && !busy) ? <TouchableOpacity style={styles.accept} onPress={openDetails}><Text style={styles.acceptText}>Voir les détails</Text></TouchableOpacity> : <>
        <TouchableOpacity accessibilityRole="button" disabled={busy || !actionable} style={[styles.decline, !actionable && styles.disabled]} onPress={() => { void answer('decline'); }}>
          <Text style={styles.declineText}>Refuser</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy || !actionable, busy }} disabled={busy || !actionable}
          style={[styles.accept, !actionable && styles.disabled]} onPress={() => { void answer('accept'); }}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.acceptText}>Accepter</Text>}
        </TouchableOpacity>
      </>}
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.white }, top: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  eyebrow: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1, color: Colors.primary }, close: { padding: 8 },
  content: { padding: 24, gap: 20 }, icon: { alignSelf: 'flex-start', padding: 22, borderRadius: 28, backgroundColor: '#FFF0E9' },
  successIcon: { backgroundColor: '#ECFAF1' }, title: { fontSize: 32, fontWeight: '800', color: Colors.gray[900] },
  copy: { fontSize: 15, lineHeight: 22, color: Colors.gray[600], fontWeight: '400' }, passenger: { fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
  route: { padding: 20, backgroundColor: Colors.gray[50], borderRadius: 20, gap: 8 }, routeLabel: { fontSize: 11, letterSpacing: 1, color: Colors.gray[600], fontWeight: '700' },
  address: { color: Colors.gray[900], fontSize: 18, lineHeight: 26, fontWeight: '600' }, separator: { height: 16, borderLeftWidth: 2, borderColor: Colors.gray[300], marginLeft: 4 },
  fare: { gap: 4 }, amount: { color: Colors.gray[900], fontSize: 25, fontWeight: '800' }, countdown: { color: Colors.primaryDark, fontSize: 17, fontWeight: '700' },
  error: { color: Colors.danger, fontSize: 15, lineHeight: 23 }, retry: { padding: 16, backgroundColor: Colors.gray[100], borderRadius: 12 },
  footer: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderColor: Colors.gray[100] },
  accept: { flex: 1, padding: 18, minHeight: 56, backgroundColor: Colors.primary, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  decline: { flex: 1, padding: 18, minHeight: 56, backgroundColor: Colors.gray[100], borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  acceptText: { color: Colors.white, fontSize: 17, fontWeight: '700' }, declineText: { color: Colors.gray[800], fontSize: 17, fontWeight: '700' }, disabled: { opacity: 0.45 },
});
