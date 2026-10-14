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
import { CashCommissionNotice } from '@/features/driver-payments/CashCommissionNotice';
import { RequestPassengerContact } from '@/features/request-detail/RequestPassengerContact';
import { useAppDispatch } from '@/store/hooks';
import { inviteAcceptedRequestContact } from '@/store/slices/rideEntrySlice';
import { getTokenSessionVersion } from '@/services/tokenSession';

export default function IncomingDriverScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: string }>();
  return <IncomingDriverContent key={`${params.kind}:${params.id}`} />;
}

function IncomingDriverContent() {
  const params = useLocalSearchParams<{ id?: string; kind?: string; driverId?: string; actionEvent?: string }>();
  const router = useRouter();
  const dispatch = useAppDispatch();
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
  const navigatedAfterAcceptance = useRef(false);
  const openAcceptedRequest = useCallback((requestId: string) => {
    if (navigatedAfterAcceptance.current) return;
    navigatedAfterAcceptance.current = true;
    router.replace(getTripRequestDetailHref(requestId));
  }, [router]);
  const openAcceptedBooking = useCallback((tripId: string, ongoing: boolean) => {
    if (navigatedAfterAcceptance.current) return;
    navigatedAfterAcceptance.current = true;
    router.replace({ pathname: ongoing ? '/trip/navigate/[id]' : '/trip/manage/[id]', params: { id: tripId } });
  }, [router]);
  const consumed = useRef(false);
  useEffect(() => { consumed.current = false; }, [id, params.actionEvent]);
  const mounted = useRef(true);
  const current = useRef({ active, userId: user?.id });
  current.current = { active, userId: user?.id };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active || kind !== 'dispatch') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, kind]);
  const localDeadline = useMemo(() => offer.data ? Date.now() + Date.parse(offer.data.expiresAt) - Date.parse(offer.data.serverNow) : 0, [offer.data]);
  const remaining = Math.max(0, Math.ceil((localDeadline - now) / 1000));
  const driverId = kind === 'dispatch' ? offer.data?.driverId : booking.data?.trip?.driverId;
  const invitation = useMemo<DriverInvitation | null>(() => kind && id && driverId ? { kind, id, driverId } : null, [kind, id, driverId]);
  useEffect(() => {
    if (!active || !invitation) return;
    return () => { void dismissDriverInvitation(invitation).catch(() => {}); };
  }, [active, invitation]);
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
    if (!invitation || !actionable || inFlight.current || done || navigatedAfterAcceptance.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const sessionVersion = getTokenSessionVersion();
    const canContinue = () => mounted.current && current.current.active &&
      current.current.userId === invitation.driverId && sessionVersion === getTokenSessionVersion();
    void dismissDriverInvitation(invitation).catch(() => {});
    try {
      if (invitation.kind === 'dispatch') {
        const result = await respond({ id, decision }).unwrap();
        if (decision === 'accept') {
          if (result.status !== 'accepted' || !result.requestId) throw new Error('Votre acceptation n’est pas encore confirmée. Vérifiez la proposition.');
          if (canContinue()) openAcceptedRequest(result.requestId);
        }
      }
      else {
        const result = await respondBooking({ id, accept: decision === 'accept' }).unwrap();
        if (decision === 'accept') {
          if (result.id !== id || result.status !== 'accepted' || result.tripId !== booking.currentData?.tripId)
            throw new Error('Votre acceptation n’est pas encore confirmée. Vérifiez la réservation.');
          if (canContinue()) openAcceptedBooking(result.tripId, booking.currentData?.trip?.status === 'ongoing');
        }
      }
      if (canContinue()) setDone(decision);
      void dismissDriverInvitation(invitation).catch(() => {});
    } catch (cause) {
      if (canContinue()) setError(getApiErrorMessage(cause, 'Votre réponse n’a pas pu être confirmée. Vérifiez la connexion puis réessayez.'));
      // Reconcile an ambiguous result; never queue a later automatic acceptance.
      if (kind === 'dispatch') void refetchOffer(); else void refetchBooking();
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }, [invitation, actionable, done, respond, id, respondBooking, kind, refetchOffer, refetchBooking, openAcceptedRequest, openAcceptedBooking, booking.currentData]);

  const acceptedOffer = user?.id && kind === 'dispatch' && !offer.isFetching && !offer.isError &&
    offer.currentData?.id === id && offer.currentData.status === 'accepted' &&
    offer.currentData.driverId === user?.id ? offer.currentData : null;
  const acceptedBooking = user?.id && kind === 'booking' && !booking.isFetching && !booking.isError &&
    booking.currentData?.id === id && booking.currentData.status === 'accepted' &&
    booking.currentData.trip?.driverId === user?.id ? booking.currentData : null;

  // A notification opened after acceptance goes straight to the existing trip,
  // using the server response, never another accept or a second "Voir les détails".
  useEffect(() => {
    if (!active || !authorized || !user?.id) return;
    if (acceptedOffer) {
      dispatch(inviteAcceptedRequestContact({ userId: user.id, requestId: acceptedOffer.requestId }));
      openAcceptedRequest(acceptedOffer.requestId);
    } else if (acceptedBooking) {
      openAcceptedBooking(acceptedBooking.tripId, acceptedBooking.trip?.status === 'ongoing');
    }
  }, [active, authorized, dispatch, acceptedOffer, acceptedBooking, openAcceptedRequest, openAcceptedBooking, user?.id]);

  useEffect(() => {
    if (!active || !invitation || !user?.id || !authorized || loading || consumed.current) return;
    consumed.current = true;
    void consumeDriverAction(invitation, user.id).then(decision => {
      if (decision && mounted.current && current.current.active && current.current.userId === invitation.driverId) return answer(decision);
    }).catch(() => setError('Touchez Accepter ou Refuser pour confirmer votre choix.'));
  }, [active, invitation, user?.id, authorized, loading, answer, params.actionEvent]);

  const openDetails = () => {
    if (kind === 'dispatch' && offer.data) router.replace(getTripRequestDetailHref(offer.data.requestId));
    else if (booking.data) router.replace({ pathname: '/trip/manage/[id]', params: { id: booking.data.tripId } });
    else router.replace('/(tabs)');
  };
  const failedRead = Boolean(kind === 'dispatch' ? offer.error : booking.error);
  // Do not flash the incoming/success card while a processed invitation redirects.
  if (navigatedAfterAcceptance.current || acceptedOffer || acceptedBooking || done === 'accept') return null;
  if (loading && !failedRead && !busy) return <SafeAreaView style={[styles.screen, styles.loading]}>
    <ActivityIndicator size="large" color={Colors.primary} accessibilityLabel="Chargement de la proposition" />
  </SafeAreaView>;
  return <SafeAreaView style={styles.screen}>
    <View style={styles.top}>
      <Text style={styles.eyebrow}>{kind === 'dispatch' ? 'PROPOSITION À PROXIMITÉ' : 'NOUVELLE RÉSERVATION'}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Fermer la proposition" disabled={busy} style={styles.close}
        onPress={() => { if (invitation) void dismissDriverInvitation(invitation).catch(() => {});
          if (router.canGoBack()) router.back(); else router.replace('/(tabs)'); }}>
        <Ionicons name="close" size={26} color={Colors.gray[700]} />
      </TouchableOpacity>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.icon}>
        <Ionicons name={done === 'decline' ? 'close' : 'car-outline'} size={42} color={Colors.primary} />
      </View>
      <Text style={styles.title}>{done === 'decline' ? 'Proposition refusée' : 'Un passager vous attend'}</Text>
      <Text style={styles.copy}>{done === 'decline' ? kind === 'dispatch' ? 'La recherche peut continuer avec un autre conducteur.' : 'Le passager sera informé de votre réponse.'
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
        {details.paymentMode === 'cash' && done !== 'decline' && <CashCommissionNotice
          amount={kind === 'booking' ? Number(booking.data?.paymentAmount ?? Number(details.pricePerSeat) * details.seats) : Number(details.pricePerSeat) * details.seats}
          confirmed={false} />}
      </>}
      {!done && kind === 'dispatch' && authorized && <Text style={styles.countdown} accessibilityLiveRegion="polite">{remaining > 0 && offer.data?.actionable ? `${remaining} s pour répondre` : 'Cette proposition n’est plus disponible'}</Text>}
      {!done && kind === 'dispatch' && authorized && offer.data && actionable &&
        <RequestPassengerContact requestId={offer.data.requestId} enabled={!busy} validUntil={localDeadline} />}
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
  loading: { alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: Colors.white }, top: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  eyebrow: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 1, color: Colors.primary }, close: { padding: 8 },
  content: { padding: 24, gap: 20 }, icon: { alignSelf: 'flex-start', padding: 22, borderRadius: 28, backgroundColor: '#FFF0E9' },
  title: { fontSize: 32, fontWeight: '800', color: Colors.gray[900] },
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
