import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useDialog } from '@/components/ui/DialogProvider';
import { displayReadOptions } from '@/hooks/useDisplayReads';
import { useProposeSharedTripMutation, useDecideSharedTripMutation, useSharedTripOffersQuery,
  type SharedTripContext, type SharedTripOffer } from '@/store/api/sharedTripApi';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { requestSummaryStyles as styles } from './requestSummaryStyles';

export function SharedTripPanel({ requestId, isOwner, readsEnabled, context, seats, hasPendingOffer, refresh, onProposed }: {
  requestId: string; isOwner: boolean; readsEnabled: boolean; context?: SharedTripContext;
  seats: number; hasPendingOffer: boolean; refresh: () => unknown; onProposed?: () => void;
}) {
  const { showDialog } = useDialog();
  const { currentData: offers = [] } = useSharedTripOffersQuery(requestId,
    displayReadOptions(readsEnabled && isOwner, 15_000));
  const [propose, proposing] = useProposeSharedTripMutation();
  const [decide, deciding] = useDecideSharedTripMutation();
  const busy = React.useRef(false);
  const activeRequest = React.useRef(requestId);
  activeRequest.current = requestId;
  React.useEffect(() => () => { activeRequest.current = ''; }, []);
  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    const current = requestId;
    try {
      await action();
      if (activeRequest.current === current) refresh();
    } catch (error) {
      if (activeRequest.current === current) showDialog({ title: 'Partage non confirmé', variant: 'warning',
        message: getApiErrorMessage(error, 'Actualisez la commande et réessayez.') });
    } finally { busy.current = false; }
  };
  const confirmOffer = (offer: SharedTripOffer) => showDialog({
    title: 'Accepter le trajet partagé ?', variant: 'info',
    message: `${offer.driver.firstName} est déjà en trajet. Vous pouvez voyager avec d’autres passagers et faire des arrêts supplémentaires. Tarif : ${offer.pricePerSeat} FC/place, soit ${offer.pricePerSeat * seats} FC pour ${seats} place(s), avant une éventuelle aide Zwanga. Votre mode de paiement reste inchangé.`,
    actions: [{ label: 'Pas maintenant', variant: 'ghost' }, { label: 'J’accepte le partage', variant: 'primary',
      onPress: () => { void run(() => decide({ requestId, offerId: offer.id, accept: true }).unwrap()); } }],
  });
  if (isOwner) return <>{offers.map(offer => <View key={offer.id} style={styles.card}>
    <Text style={styles.name}>Proposition de trajet partagé</Text>
    <Text style={styles.muted}>{offer.driver.firstName} est déjà en trajet. {offer.pricePerSeat} FC par place. Votre accord est nécessaire.</Text>
    <View style={styles.actionRow}>
      <TouchableOpacity accessibilityRole="button" disabled={deciding.isLoading} style={styles.cancel}
        onPress={() => { void run(() => decide({ requestId, offerId: offer.id, accept: false }).unwrap()); }}>
        <Text style={styles.cancelText}>Refuser</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={deciding.isLoading} style={styles.primary} onPress={() => confirmOffer(offer)}>
        <Text style={styles.primaryText}>Voir et accepter</Text>
      </TouchableOpacity>
    </View>
    <Text style={styles.muted}>Un refus laisse votre commande ouverte.</Text>
  </View>)}</>;
  if (!context?.hasOngoingTrip) return null;
  return <View style={styles.card}>
    <Text style={styles.name}>Ajouter à votre trajet en cours</Text>
    <Text style={styles.muted}>{hasPendingOffer ? 'Proposition envoyée. Attendez l’accord du passager avant sa prise en charge.' :
      context.trip ? `${context.trip.availableSeats} place(s) disponible(s) · ${context.trip.pricePerSeat} FC/place. Vérifiez que ce détour convient à votre trajet actuel.` : context.reason}</Text>
    {context.trip && !hasPendingOffer && <TouchableOpacity accessibilityRole="button" disabled={proposing.isLoading} style={styles.primary}
      onPress={() => showDialog({ title: 'Proposer le partage ?', variant: 'info',
        message: 'Vous vous engagez à prendre en charge ce passager dans votre trajet actuel si celui-ci accepte. Vérifiez les adresses et le détour avant de confirmer. Aucune nouvelle course indépendante ne sera créée.',
        actions: [{ label: 'Annuler', variant: 'ghost' }, { label: 'Proposer le partage', variant: 'primary',
          onPress: () => { void run(async () => {
            await propose({ requestId, tripId: context.trip!.id }).unwrap();
            if (activeRequest.current === requestId) onProposed?.();
          }); } }],
      })}>
      <Text style={styles.primaryText}>Proposer le partage</Text>
    </TouchableOpacity>}
  </View>;
}
