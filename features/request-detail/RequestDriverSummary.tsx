import { CollapsibleRouteMap } from './CollapsibleRouteMap';
import {
  RequestRouteMapData,
  TRIP_REQUEST_VEHICLE_LABELS,
  TRIP_REQUEST_VEHICLE_ICONS,
  formatCdfPrice,
} from './requestDetailModel';
import { styles } from '../screen-styles/app/request/detail/index';
import { Colors } from '@/constants/styles';
import type { TripRequestVehicleType } from '@/types';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from '@/utils/reanimated';
import type { DriverOffer, Vehicle, TripRequest } from '@/types';
import type { useIdentityCheck } from '@/hooks/useIdentityCheck';
import { RouteLocationDetails } from '@/components/trip/RouteLocationDetails';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';

interface RequestDriverSummaryProps {
  driverHero: { badge: string; title: string; subtitle: string; };
  myOffer: DriverOffer | null | undefined;
  tripRequest: TripRequest;
  requestRouteMapData: RequestRouteMapData | null;
  displayedRouteCoordinates: { latitude: number; longitude: number; }[];
  requestedVehicleType: TripRequestVehicleType;
  canOpenAssignedTrip: boolean;
  handleViewTrip: (tripId: string) => void;
  canStartAssignedTrip: boolean;
  handleStartTripFromRequest: () => Promise<void>;
  isStartingTripFromRequest: boolean;
  canAcceptDirectly: boolean;
  handleOpenDirectAcceptModal: () => void;
  isAcceptingTripRequest: boolean;
  isStartingTrip: boolean;
  isDriverAccount: boolean;
  openDriverOnboarding: () => void;
  isIdentityVerified: boolean;
  checkIdentity: ReturnType<typeof useIdentityCheck>['checkIdentity'];
  compatibleActiveVehicles: Vehicle[];
}

export function RequestDriverSummary({
  driverHero,
  myOffer,
  tripRequest,
  requestRouteMapData,
  displayedRouteCoordinates,
  requestedVehicleType,
  canOpenAssignedTrip,
  handleViewTrip,
  canStartAssignedTrip,
  handleStartTripFromRequest,
  isStartingTripFromRequest,
  canAcceptDirectly,
  handleOpenDirectAcceptModal,
  isAcceptingTripRequest,
  isStartingTrip,
  isDriverAccount,
  openDriverOnboarding,
  isIdentityVerified,
  checkIdentity,
  compatibleActiveVehicles,
}: RequestDriverSummaryProps) {
  const routeLabels = useRouteLocationLabels(tripRequest);
  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      layout={LinearTransition.duration(220)}
      style={[styles.ownerHeroCard, styles.driverHeroCard]}
    >
      <View style={styles.ownerHeroTopRow}>
        <View style={styles.driverHeroStatusBadge}>
          <View style={styles.driverHeroStatusDot} />
          <Text style={styles.driverHeroStatusText}>{driverHero.badge}</Text>
        </View>
        {!!myOffer?.pricePerSeat && (
          <View style={styles.ownerHeroCounter}>
            <Ionicons name="cash-outline" size={14} color={Colors.white} />
            <Text style={styles.ownerHeroCounterText}>{myOffer.pricePerSeat} FC</Text>
          </View>
        )}
      </View>

      <View style={styles.driverHeroPassengerRow}>
        {tripRequest.passengerAvatar ? (
          <Image source={{ uri: tripRequest.passengerAvatar }} style={styles.driverHeroAvatar} />
        ) : (
          <View style={styles.driverHeroAvatar}>
            <Ionicons name="person" size={18} color={Colors.white} />
          </View>
        )}
        <View style={styles.driverHeroPassengerInfo}>
          <Text style={styles.driverHeroPassengerLabel}>Demande de</Text>
          <Text style={styles.driverHeroPassengerName}>{tripRequest.passengerName}</Text>
        </View>
        <View style={styles.driverHeroRoleBadge}>
          <Ionicons name="person-circle-outline" size={14} color={Colors.gray[600]} />
          <Text style={styles.driverHeroRoleBadgeText}>Passager</Text>
        </View>
      </View>

      <Text style={styles.ownerHeroTitle} numberOfLines={2}>{driverHero.title}</Text>
      <Text style={styles.ownerHeroSubtitle} numberOfLines={2}>{driverHero.subtitle}</Text>

      <Animated.View layout={LinearTransition.duration(220)} style={styles.driverRouteCard}>
        <RouteLocationDetails labels={routeLabels} tone="dark" trailingInset={44} />

        <CollapsibleRouteMap
          arrivalName={routeLabels.arrival.address}
          departureName={routeLabels.departure.address}
          mapData={requestRouteMapData}
          routeCoordinates={displayedRouteCoordinates}
        />
      </Animated.View>

      <View style={styles.driverVehicleSpotlight}>
        <View style={styles.driverVehicleIconShell}>
          <Ionicons
            name={TRIP_REQUEST_VEHICLE_ICONS[requestedVehicleType]}
            size={28}
            color={Colors.primary}
          />
        </View>
        <View style={styles.driverVehicleCopy}>
          <Text style={styles.driverVehicleEyebrow}>Véhicule demandé</Text>
          <Text style={styles.driverVehicleName}>
            {TRIP_REQUEST_VEHICLE_LABELS[requestedVehicleType]}
          </Text>
          <Text style={styles.driverVehicleHint}>Souhaité par le passager pour cette course</Text>
        </View>
        <View style={styles.driverVehicleCheck}>
          <Ionicons name="checkmark" size={16} color={Colors.white} />
        </View>
      </View>

      <View style={styles.driverFactsRow}>
        <View style={styles.driverFact}>
          <Ionicons name="time-outline" size={18} color={Colors.primary} />
          <Text style={styles.driverFactLabel}>Départ souhaité</Text>
          <Text style={styles.driverFactValue} numberOfLines={2}>
            {formatDateWithRelativeLabel(tripRequest.departureDateMin, true)}
          </Text>
        </View>
        <View style={styles.driverFactDivider} />
        <View style={styles.driverFact}>
          <Ionicons name="people-outline" size={18} color={Colors.primary} />
          <Text style={styles.driverFactLabel}>Passagers</Text>
          <Text style={styles.driverFactValue}>
            {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
          </Text>
        </View>
        {tripRequest.maxPricePerSeat ? (
          <>
            <View style={styles.driverFactDivider} />
            <View style={styles.driverFact}>
              <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
              <Text style={styles.driverFactLabel}>Budget max.</Text>
              <Text style={styles.driverFactValue}>{formatCdfPrice(tripRequest.maxPricePerSeat)}</Text>
            </View>
          </>
        ) : null}
      </View>

      {canOpenAssignedTrip ? (
        <TouchableOpacity
          style={styles.ownerHeroPrimaryButton}
          onPress={() => handleViewTrip(tripRequest.tripId!)}
        >
          <Ionicons name="navigate-outline" size={18} color={Colors.white} />
          <Text style={styles.ownerHeroPrimaryButtonText}>Ouvrir le trajet</Text>
        </TouchableOpacity>
      ) : canStartAssignedTrip ? (
        <TouchableOpacity
          style={styles.ownerHeroPrimaryButton}
          onPress={handleStartTripFromRequest}
          disabled={isStartingTripFromRequest}
        >
          {isStartingTripFromRequest ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons name="play-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.ownerHeroPrimaryButtonText}>Démarrer le trajet</Text>
            </>
          )}
        </TouchableOpacity>
      ) : canAcceptDirectly ? (
        <TouchableOpacity
          style={styles.ownerHeroPrimaryButton}
          onPress={handleOpenDirectAcceptModal}
          disabled={isAcceptingTripRequest || isStartingTrip}
        >
          {isAcceptingTripRequest || isStartingTrip ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.white} />
              <Text style={styles.ownerHeroPrimaryButtonText}>Accepter la demande</Text>
            </>
          )}
        </TouchableOpacity>
      ) : !isDriverAccount ? (
        <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={openDriverOnboarding}>
          <Ionicons name="car-outline" size={18} color={Colors.white} />
          <Text style={styles.ownerHeroPrimaryButtonText}>Devenir conducteur</Text>
        </TouchableOpacity>
      ) : !isIdentityVerified ? (
        <TouchableOpacity style={styles.ownerHeroPrimaryButton} onPress={() => checkIdentity('publish')}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.white} />
          <Text style={styles.ownerHeroPrimaryButtonText}>Vérifier mon identité</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.ownerHeroHintRow}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.ownerHeroHintText}>
            {compatibleActiveVehicles.length === 0
              ? 'Aucun de vos véhicules actifs ne correspond au type demandé pour cette course.'
              : 'Cette demande ne peut plus être acceptée. Actualisez l’écran pour obtenir son dernier statut.'}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
