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
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from '@/utils/reanimated';
import type { TripRequest } from '@/types';
import { RouteLocationDetails } from '@/components/trip/RouteLocationDetails';
import { useRouteLocationLabels } from '@/hooks/useRouteLocationLabels';

interface RequestPassengerSummaryProps {
  statusConfig: { label: string; color: string; bg: string };
  pendingOffersCount: number;
  tripRequest: TripRequest;
  ownerHero: { title: string; subtitle: string; };
  requestRouteMapData: RequestRouteMapData | null;
  displayedRouteCoordinates: { latitude: number; longitude: number; }[];
  requestedVehicleType: TripRequestVehicleType;
  ownerDisplayedBudget: number | null | undefined;
  heroStepIndex: number;
  heroSteps: string[];
  handleViewTrip: (tripId: string) => void;
  ownerHeroHintMessage: string;
  canEdit: boolean;
  canCancel: boolean;
  handleOpenEditForm: () => void;
  isCancelling: boolean;
  handleCancelRequest: () => Promise<void>;
}

export function RequestPassengerSummary({
  statusConfig,
  pendingOffersCount,
  tripRequest,
  ownerHero,
  requestRouteMapData,
  displayedRouteCoordinates,
  requestedVehicleType,
  ownerDisplayedBudget,
  heroStepIndex,
  heroSteps,
  handleViewTrip,
  ownerHeroHintMessage,
  canEdit,
  canCancel,
  handleOpenEditForm,
  isCancelling,
  handleCancelRequest,
}: RequestPassengerSummaryProps) {
  const routeLabels = useRouteLocationLabels(tripRequest);
  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      layout={LinearTransition.duration(220)}
      style={[styles.ownerHeroCard, styles.ownerRequestHeroCard]}
    >
      <View style={styles.ownerHeroTopRow}>
        <View style={[styles.ownerHeroStatusBadge, { backgroundColor: statusConfig.bg }]}>
          <View style={[styles.ownerHeroStatusDot, { backgroundColor: statusConfig.color }]} />
          <Text style={[styles.ownerHeroStatusText, { color: statusConfig.color }]}>
            {statusConfig.label}
          </Text>
        </View>
        {pendingOffersCount > 0 && !tripRequest.tripId && (
          <View style={styles.ownerHeroCounter}>
            <Ionicons name="sparkles-outline" size={14} color={Colors.white} />
            <Text style={styles.ownerHeroCounterText}>
              {pendingOffersCount} réponse{pendingOffersCount > 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.ownerHeroLead}>
        <View style={styles.ownerHeroLeadIcon}>
          <Ionicons
            name={
              tripRequest.tripId
                ? 'navigate'
                : pendingOffersCount > 0
                  ? 'chatbubbles'
                  : 'radio'
            }
            size={24}
            color={Colors.primary}
          />
        </View>
        <View style={styles.ownerHeroLeadCopy}>
          <Text style={styles.ownerHeroTitle} numberOfLines={2}>{ownerHero.title}</Text>
          <Text style={styles.ownerHeroSubtitle} numberOfLines={2}>{ownerHero.subtitle}</Text>
        </View>
      </View>

      <Animated.View layout={LinearTransition.duration(220)} style={styles.driverRouteCard}>
        <RouteLocationDetails labels={routeLabels} tone="dark" trailingInset={44} />
        <CollapsibleRouteMap
          arrivalName={routeLabels.arrival.address}
          departureName={routeLabels.departure.address}
          mapData={requestRouteMapData}
          routeCoordinates={displayedRouteCoordinates}
        />
      </Animated.View>

      <View style={[styles.driverVehicleSpotlight, styles.ownerVehicleSpotlight]}>
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
          <Text style={styles.driverVehicleHint}>
            Choisi pour {tripRequest.numberOfSeats} place{tripRequest.numberOfSeats > 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.ownerVehicleChoiceIcon}>
          <Ionicons name="checkmark" size={16} color={Colors.primary} />
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
          <Ionicons name="hourglass-outline" size={18} color={Colors.primary} />
          <Text style={styles.driverFactLabel}>Au plus tard</Text>
          <Text style={styles.driverFactValue} numberOfLines={2}>
            {formatDateWithRelativeLabel(tripRequest.departureDateMax, true)}
          </Text>
        </View>
        {ownerDisplayedBudget ? (
          <>
            <View style={styles.driverFactDivider} />
            <View style={styles.driverFact}>
              <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
              <Text style={styles.driverFactLabel}>Budget</Text>
              <Text style={styles.driverFactValue}>{formatCdfPrice(ownerDisplayedBudget)}</Text>
            </View>
          </>
        ) : null}
      </View>

      {tripRequest.selectedDriverRequiresPassengerKyc ? (
        <View style={styles.ownerPassengerKycNotice}>
          <View style={styles.ownerPassengerKycNoticeIcon}>
            <Ionicons name="shield-checkmark-outline" size={17} color={Colors.primary} />
          </View>
          <View style={styles.ownerPassengerKycNoticeCopy}>
            <Text style={styles.ownerPassengerKycNoticeTitle}>Identité vérifiée requise</Text>
            <Text style={styles.ownerPassengerKycNoticeText}>
              Ce conducteur demande une vérification d&apos;identité approuvée avant la prise en charge.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.ownerProgressPanel}>
        <View style={styles.ownerProgressHeader}>
          <Text style={styles.ownerProgressTitle}>Suivi de la demande</Text>
          <Text style={styles.ownerProgressCount}>
            {heroStepIndex >= 0 ? `Étape ${heroStepIndex + 1} sur 4` : 'Demande clôturée'}
          </Text>
        </View>
        <View style={styles.ownerHeroSteps}>
          {heroSteps.map((step, index) => {
            const active = heroStepIndex >= index;
            return (
              <View key={step} style={styles.ownerHeroStep}>
                <View
                  style={[
                    styles.ownerHeroStepDot,
                    active && styles.ownerHeroStepDotActive,
                  ]}
                />
                <Text
                  style={[
                    styles.ownerHeroStepText,
                    active && styles.ownerHeroStepTextActive,
                  ]}
                >
                  {step}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {tripRequest.tripId ? (
        <TouchableOpacity
          style={styles.ownerHeroPrimaryButton}
          onPress={() => handleViewTrip(tripRequest.tripId!)}
        >
          <Ionicons name="navigate-outline" size={18} color={Colors.white} />
          <Text style={styles.ownerHeroPrimaryButtonText}>Voir mon trajet</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.ownerHeroHintRow}>
          <Ionicons name="notifications-outline" size={16} color={Colors.primary} />
          <Text style={styles.ownerHeroHintText}>{ownerHeroHintMessage}</Text>
        </View>
      )}

      {(canEdit || canCancel) && (
        <View style={styles.ownerHeroActions}>
          {canEdit && (
            <Pressable
              style={({ pressed }) => [
                styles.ownerHeroGhostButton,
                pressed && styles.ownerHeroButtonPressed,
              ]}
              onPress={handleOpenEditForm}
            >
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={styles.ownerHeroGhostButtonText}>Modifier</Text>
            </Pressable>
          )}
          {canCancel && (
            <Pressable
              style={({ pressed }) => [
                styles.ownerHeroGhostButton,
                styles.ownerHeroGhostButtonDanger,
                pressed && styles.ownerHeroButtonPressed,
                isCancelling && styles.ownerHeroButtonDisabled,
              ]}
              onPress={handleCancelRequest}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size="small" color={Colors.danger} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={16} color={Colors.danger} />
                  <Text style={[styles.ownerHeroGhostButtonText, styles.ownerHeroGhostButtonTextDanger]}>
                    Annuler
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}
