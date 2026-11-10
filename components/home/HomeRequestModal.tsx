import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RideModal } from '@/features/navigation/RideModal';
import { useRideOverlayStore } from '@/features/navigation/RideOverlayProvider';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { useHomeRequestDecision } from '@/hooks/home/useHomeRequestDecision';
import { formatPrice, placeName } from '@/features/home/homeModel';
import { homeRequestDepartureLabel, homeSeatsLabel } from '@/features/home/homeCardPresentation';
import { requestTotalPrice } from '@/features/trip-request/requestPriceDisplay';
import { styles, colors } from '@/features/home/HomeRequestModal.styles';

export function HomeRequestModal(props: Parameters<typeof useHomeRequestDecision>[0] & { priority?: number }) {
  const store = useRideOverlayStore();
  const decision = useHomeRequestDecision({ ...props, enabled: props.enabled && Boolean(store) });
  const insets = useSafeAreaInsets();
  const order = decision.order;
  const [expandedVehicleOrder, setExpandedVehicleOrder] = useState<string | null>(null);
  const chooseVehicle = !decision.vehicle || expandedVehicleOrder === order?.id;
  const price = order && requestTotalPrice(order.selectedPricePerSeat ?? order.maxPricePerSeat, order.numberOfSeats);
  const message = decision.error || (decision.readError ? 'Connexion indisponible. Réessayez.'
    : decision.loading ? 'Chargement de la commande…'
    : !decision.available ? 'Cette commande n’est plus à accepter ici. Consultez les détails.'
    : !decision.isIdentityVerified ? 'Vérifiez votre profil pour accepter cette commande.'
    : !decision.vehicles.length ? 'Aucun de vos véhicules actifs ne correspond à cette commande.' : '');
  // Always use the shared in-app host. Never fall back to a second UIKit presentation.
  if (!store) return null;
  return <RideModal inApp transparent visible={decision.visible} priority={props.priority ?? RIDE_OVERLAY_PRIORITY.panel}
    onRequestClose={decision.close} onDismiss={decision.onDismiss}>
    <View style={[styles.backdrop, { paddingTop: Math.max(16, insets.top), paddingBottom: Math.max(16, insets.bottom) }]}>
      <View style={styles.panel} accessibilityViewIsModal testID="home-request-modal">
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.heading}>
            <View style={styles.orderIcon}><Ionicons name="car-outline" size={20} color={colors.orange} accessible={false} /></View>
            <Text style={styles.title} accessibilityRole="header">Nouvelle commande</Text>
          </View>
          {price !== null && price !== undefined && price > 0 ? <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(price)}</Text><Text style={styles.muted}>pour le trajet</Text>
          </View> : null}
          <View style={styles.route}>
            <View style={styles.routeRow}>
              <Ionicons name="radio-button-on" size={20} color={colors.green} accessible={false} />
              <View style={styles.routeCopy}><Text style={styles.muted}>Départ</Text>
                <Text style={styles.place}>{placeName(order?.departure)}</Text>
                {order?.departure?.reference?.trim() ? <Text style={styles.reference}>{order.departure.reference.trim()}</Text> : null}</View>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={20} color={colors.orange} accessible={false} />
              <View style={styles.routeCopy}><Text style={styles.muted}>Arrivée</Text>
                <Text style={styles.place}>{placeName(order?.arrival)}</Text>
                {order?.arrival?.reference?.trim() ? <Text style={styles.reference}>{order.arrival.reference.trim()}</Text> : null}</View>
            </View>
          </View>
          <View style={styles.passengerRow}>
            <Ionicons name="person-circle-outline" size={28} color={colors.muted} accessible={false} />
            <View style={styles.routeCopy}>
              <Text style={styles.passenger}>{order?.passengerName?.trim() || 'Passager Zwanga'}</Text>
              {order ? <Text style={styles.metadata}>{homeRequestDepartureLabel(order.departureDateMin, order.departureDateMax)} · {homeSeatsLabel(order.numberOfSeats)}</Text> : null}
            </View>
          </View>
          {decision.vehicles.length > 0 ? <>
            {!chooseVehicle && decision.vehicle ? <TouchableOpacity style={styles.vehicleSummary}
              disabled={decision.busy || decision.vehicles.length === 1} accessibilityRole="button"
              accessibilityLabel={`Votre véhicule : ${decision.vehicle.brand} ${decision.vehicle.model}, ${decision.vehicle.licensePlate}`}
              accessibilityState={{ disabled: decision.busy || decision.vehicles.length === 1, expanded: false }}
              onPress={() => setExpandedVehicleOrder(order?.id ?? null)}>
              <Ionicons name="car-outline" size={20} color={colors.muted} accessible={false} />
              <View style={styles.routeCopy}><Text style={styles.muted}>Votre véhicule</Text>
                <Text style={styles.vehicleText}>{decision.vehicle.brand} {decision.vehicle.model} · {decision.vehicle.licensePlate}</Text></View>
              {decision.vehicles.length > 1 ? <Text style={styles.change}>Changer</Text> : null}
            </TouchableOpacity> : <>
              <Text style={styles.vehicleHeading}>Choisissez votre véhicule</Text>
              {decision.vehicles.map(vehicle => <TouchableOpacity key={vehicle.id} accessibilityRole="radio"
              accessibilityState={{ checked: vehicle.id === decision.vehicle?.id, disabled: decision.busy }}
              disabled={decision.busy} onPress={() => { decision.selectVehicle(vehicle.id); setExpandedVehicleOrder(null); }}
              style={[styles.vehicle, vehicle.id === decision.vehicle?.id && styles.selectedVehicle]}>
              <Ionicons name={vehicle.id === decision.vehicle?.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.orange} accessible={false} />
              <Text style={styles.vehicleText}>{vehicle.brand} {vehicle.model} · {vehicle.licensePlate}</Text>
              </TouchableOpacity>)}
            </>}
          </> : null}
          {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
          {decision.readError ? <TouchableOpacity onPress={decision.retry} accessibilityRole="button" style={styles.link}>
            <Text style={styles.linkText}>Réessayer</Text>
          </TouchableOpacity> : null}
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.actions}>
            <TouchableOpacity onPress={decision.close} disabled={decision.busy} accessibilityRole="button"
              accessibilityHint="Fermer ce message sans refuser la commande." style={[styles.button, styles.ignore]}>
              <Text style={styles.ignoreText}>Ignorer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void decision.accept(); }} disabled={!decision.canAccept} accessibilityRole="button"
              accessibilityState={{ disabled: !decision.canAccept, busy: decision.busy }}
              style={[styles.button, styles.accept, !decision.canAccept && styles.disabled]}>
              {decision.busy ? <ActivityIndicator color="#FFFFFF" /> : null}
              <Text style={styles.acceptText}>{decision.busy ? 'Acceptation…' : 'Accepter'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={decision.openDetails} disabled={decision.busy} accessibilityRole="button" style={styles.link}>
            <Text style={styles.linkText}>Voir les détails</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </RideModal>;
}
