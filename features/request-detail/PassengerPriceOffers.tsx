import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAcceptDriverOfferMutation } from '@/store/api/tripRequestApi';
import { useDeclineCounterOfferMutation } from '@/store/api/counterOfferApi';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { acknowledgeRideAlerts, dismissRideResponseNotice, pendingRideResponseNotices } from '@/services/rideAlertSession';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { DriverOffer, TripRequest } from '@/types';
import { NegotiationPriceInput } from './NegotiationPriceInput';
import { alternativesMessage, negotiationActions } from './priceNegotiation';
import { useGetPriceAlternativesQuery } from '@/store/api/priceNegotiationApi';
import { pendingPriceOffers } from './counterOfferPolicy';
import { requestPriceLabel } from '@/features/trip-request/requestPriceDisplay';

export function PassengerPriceOffers({ request, enabled, refresh }: { request: TripRequest; enabled: boolean; refresh: () => unknown }) {
  return <>{pendingPriceOffers(request).map(offer => <PassengerPriceOffer key={offer.id} request={request} offer={offer} enabled={enabled} refresh={refresh} />)}</>;
}
function PassengerPriceOffer({ request, offer, enabled, refresh }: { request: TripRequest; offer: DriverOffer; enabled: boolean; refresh: () => unknown }) {
  const router = useRouter();
  const [negotiating, setNegotiating] = useState(false), [changing, setChanging] = useState(false);
  const actions = negotiationActions(offer, 'passenger');
  const alternatives = useGetPriceAlternativesQuery({ requestId: request.id, offerId: offer.id }, { skip: !enabled || !changing, refetchOnMountOrArgChange: true });
  const [accept, accepting] = useAcceptDriverOfferMutation(), [decline, declining] = useDeclineCounterOfferMutation();
  const [error, setError] = useState('');
  const busy = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const offers = pendingPriceOffers(request);
  const decide = async (offerId: string, yes: boolean) => {
    if (!enabled || negotiating || busy.current || (yes && !actions.accept) || !offers.some(offer => offer.id === offerId)) return;
    const version = getTokenSessionVersion(); busy.current = true; setError('');
    try {
      if (yes) await accept({ tripRequestId: request.id, payload: { offerId } }).unwrap();
      else await decline({ requestId: request.id, offerId }).unwrap();
      if (!mounted.current || version !== getTokenSessionVersion()) return;
      acknowledgeRideAlerts(alert => alert.recipientId === request.passengerId && alert.data.offerId === offerId);
      pendingRideResponseNotices(request.passengerId).filter(alert => alert.data.offerId === offerId).forEach(dismissRideResponseNotice);
      refresh();
    } catch (cause) {
      if (mounted.current && version === getTokenSessionVersion()) {
        setError(getApiErrorMessage(cause, 'Réponse non confirmée. Actualisez avant de réessayer.')); refresh();
      }
    } finally { busy.current = false; }
  };
  const disabled = !enabled || negotiating || accepting.isLoading || declining.isLoading;
  return <View style={s.section}>
    <Text style={s.title}>{offer.negotiationStage === 'passenger_counter' ? 'Votre prix envoyé au conducteur' : `${offer.driverName || 'Un conducteur'} propose ${offer.negotiationStage === 'driver_final' ? 'son prix ferme' : 'un prix'}`}</Text>
    <Text style={s.price}>{requestPriceLabel(offer.pricePerSeat, request.numberOfSeats)} pour le trajet</Text>
    <Text style={s.hint}>Pour {request.numberOfSeats} passager(s), avant une éventuelle aide Zwanga.</Text>
    {!!offer.vehicleInfo && <Text style={s.hint}>{offer.vehicleInfo}</Text>}
    {offer.requiresPassengerKyc && <Text style={s.hint}>Ce conducteur demande une identité vérifiée.</Text>}
    {offer.negotiationStage === 'passenger_counter' && <Text style={s.hint}>En attente : le conducteur peut accepter ou proposer son prix ferme.</Text>}
    <NegotiationPriceInput request={request} offer={offer} actor="passenger" disabled={disabled} refresh={refresh} onBusyChange={setNegotiating} />
    <View style={s.actions}>
      <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, s.secondary, disabled && s.disabled]} onPress={() => setChanging(true)}><Text style={s.secondaryText}>Chercher un autre conducteur</Text></Pressable>
      {actions.accept && <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, s.primary, disabled && s.disabled]} onPress={() => { void decide(offer.id, true); }}>
        {accepting.isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryText}>Accepter ce prix</Text>}
      </Pressable>}
    </View>
    {changing && <View style={s.section}>
      <Text accessibilityLiveRegion="polite" style={s.hint}>{alternatives.isFetching ? 'Recherche des autres conducteurs…' : alternativesMessage(alternatives.isError ? undefined : alternatives.currentData, request.id, offer.id)}</Text>
      <Text style={s.hint}>Ce prix sera refusé. Votre commande restera ouverte.</Text>
      <Pressable accessibilityRole="button" disabled={disabled} style={[s.button, s.secondary, disabled && s.disabled]} onPress={() => void decide(offer.id, false)}><Text style={s.secondaryText}>{declining.isLoading ? 'Refus en cours…' : 'Refuser et chercher un autre'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={disabled} style={s.link} onPress={() => setChanging(false)}><Text style={s.secondaryText}>Garder ce conducteur</Text></Pressable>
    </View>}
    <Pressable accessibilityRole="button" disabled={disabled} style={s.link} onPress={() => router.push({ pathname: '/driver/[id]', params: { id: offer.driverId, viewOnly: 'true' } })}>
      <Text style={s.secondaryText}>Voir le conducteur</Text>
    </Pressable>
    {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
  </View>;
}
const s = StyleSheet.create({ section: { gap: 8, paddingVertical: 12 }, title: { color: '#202734', fontSize: 16, fontWeight: '700' },
  price: { color: '#202734', fontSize: 22, fontWeight: '800' }, hint: { color: '#536071', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8 }, button: { flex: 1, padding: 12, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#CE4613' }, secondary: { backgroundColor: '#F2F4F6' }, primaryText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryText: { color: '#BA3E0F', fontWeight: '600' }, link: { minHeight: 44, justifyContent: 'center' }, disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 13, lineHeight: 19 } });
