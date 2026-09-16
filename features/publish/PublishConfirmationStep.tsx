import { PublishStep, PublicationSuccess, LatLng, PUBLISH_MAP_PROVIDER } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors, Spacing } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface PublishConfirmationStepProps {
  stepEntering: FadeInDown | undefined;
  publicationSuccess: PublicationSuccess;
  routePreviewRegion: Region;
  departureLocation: MapLocationSelection | null;
  arrivalLocation: MapLocationSelection | null;
  routeCoordinates: LatLng[];
  isRouteLoading: boolean;
  departureSummary: { title: string; address: string; latitude: number | undefined; longitude: number | undefined; };
  departureReference: string;
  formatCoordinatePair: (latitude?: number, longitude?: number) => string | null;
  arrivalSummary: { title: string; address: string; latitude: number | undefined; longitude: number | undefined; };
  arrivalReference: string;
  formattedFullDateTime: string;
  isRecurringTrip: boolean;
  recurringDaysSummary: string;
  formattedRecurringEndDate: string;
  seats: string;
  isFreeTrip: boolean;
  price: string;
  requiresPassengerKyc: boolean;
  description: string;
  insets: EdgeInsets;
  goToStep: (nextStep: PublishStep) => void;
  isSubmittingTrip: boolean;
  isPublishIdentityVerified: boolean;
  handlePublish: () => Promise<void>;
}

export function PublishConfirmationStep({
  stepEntering,
  publicationSuccess,
  routePreviewRegion,
  departureLocation,
  arrivalLocation,
  routeCoordinates,
  isRouteLoading,
  departureSummary,
  departureReference,
  formatCoordinatePair,
  arrivalSummary,
  arrivalReference,
  formattedFullDateTime,
  isRecurringTrip,
  recurringDaysSummary,
  formattedRecurringEndDate,
  seats,
  isFreeTrip,
  price,
  requiresPassengerKyc,
  description,
  insets,
  goToStep,
  isSubmittingTrip,
  isPublishIdentityVerified,
  handlePublish,
}: PublishConfirmationStepProps) {
  return (
    <Animated.View entering={stepEntering} style={styles.stepContainer}>
      <View style={[styles.iconContainer, styles.confirmIntro]}>
        <View style={[styles.iconCircle, styles.iconCircleGreen, styles.confirmIntroIcon]}>
          <Ionicons name="checkmark" size={24} color={Colors.success} />
        </View>
        <View style={styles.confirmIntroText}>
          <Text style={[styles.stepTitle, styles.confirmIntroTitle]}>Confirmation</Text>
          <Text style={[styles.stepSubtitle, styles.confirmIntroSubtitle]} numberOfLines={1}>
          Vérifiez les informations avant de publier
          </Text>
        </View>
      </View>

      <View style={[styles.publishMapPreview, styles.confirmMapPreview]}>
        {publicationSuccess === null ? (
          <MapView
            style={styles.publishMapPreviewMap}
            provider={PUBLISH_MAP_PROVIDER}
            region={routePreviewRegion}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
          >
            {departureLocation ? (
              <Marker
                coordinate={{
                  latitude: departureLocation.latitude,
                  longitude: departureLocation.longitude,
                }}
                pinColor={Colors.success}
                title="Départ"
              />
            ) : null}
            {arrivalLocation ? (
              <Marker
                coordinate={{
                  latitude: arrivalLocation.latitude,
                  longitude: arrivalLocation.longitude,
                }}
                pinColor={Colors.primary}
                title="Destination"
              />
            ) : null}
            {routeCoordinates.length > 1 ? (
              <Polyline coordinates={routeCoordinates} strokeColor={Colors.primary} strokeWidth={5} />
            ) : null}
          </MapView>
        ) : (
          <View style={styles.publishMapPreviewMap} />
        )}
        <View pointerEvents="none" style={styles.publishMapPreviewShade} />
        {departureLocation && arrivalLocation ? (
          <View pointerEvents="none" style={styles.routeStatusBadge}>
            {isRouteLoading ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Ionicons
                name={routeCoordinates.length > 1 ? 'git-branch' : 'alert-circle-outline'}
                size={15}
                color={routeCoordinates.length > 1 ? Colors.primary : Colors.gray[500]}
              />
            )}
            <Text style={styles.routeStatusText}>
              {isRouteLoading
                ? "Calcul de l'itinéraire"
                : routeCoordinates.length > 1
                  ? 'Itinéraire Google'
                  : 'Route à recalculer'}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.confirmCard}>
        {/* Itinéraire */}
        <View style={styles.confirmSection}>
          <Text style={styles.confirmSectionTitle}>ITINÉRAIRE</Text>
          <View style={styles.confirmRoute}>
            <View style={styles.confirmRouteRow}>
              <Ionicons name="location" size={20} color={Colors.success} />
              <View style={styles.confirmRouteContent}>
                <Text style={styles.confirmRouteName}>{departureSummary.title}</Text>
                {departureLocation?.address && (
                  <Text style={styles.confirmRouteAddress}>{departureSummary.address}</Text>
                )}
                {departureReference.trim() ? (
                  <Text style={styles.confirmRouteAddress}>{departureReference.trim()}</Text>
                ) : null}
                <Text style={styles.confirmRouteAddress}>
                  {formatCoordinatePair(
                    departureSummary.latitude,
                    departureSummary.longitude,
                  ) ?? '- / -'}
                </Text>
              </View>
            </View>
            <View style={styles.confirmRouteDivider} />
            <View style={styles.confirmRouteRow}>
              <Ionicons name="navigate" size={20} color={Colors.primary} />
              <View style={styles.confirmRouteContent}>
                <Text style={styles.confirmRouteName}>{arrivalSummary.title}</Text>
                {arrivalLocation?.address && (
                  <Text style={styles.confirmRouteAddress}>{arrivalSummary.address}</Text>
                )}
                {arrivalReference.trim() ? (
                  <Text style={styles.confirmRouteAddress}>{arrivalReference.trim()}</Text>
                ) : null}
                <Text style={styles.confirmRouteAddress}>
                  {formatCoordinatePair(
                    arrivalSummary.latitude,
                    arrivalSummary.longitude,
                  ) ?? '- / -'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Détails */}
        <View>
          <Text style={styles.confirmSectionTitle}>DÉTAILS</Text>
          <View style={styles.confirmDetails}>
            <View style={styles.confirmDetailRow}>
              <View style={styles.confirmDetailLeft}>
                <Ionicons name="time" size={18} color={Colors.gray[600]} />
                <Text style={styles.confirmDetailLabel}>Heure de départ</Text>
              </View>
              <Text style={styles.confirmDetailValue}>{formattedFullDateTime}</Text>
            </View>
            {isRecurringTrip ? (
              <>
                <View style={styles.confirmDetailRow}>
                  <View style={styles.confirmDetailLeft}>
                    <Ionicons name="repeat" size={18} color={Colors.gray[600]} />
                    <Text style={styles.confirmDetailLabel}>Répétition</Text>
                  </View>
                  <Text style={styles.confirmDetailValue}>
                    {recurringDaysSummary || 'À définir'}
                  </Text>
                </View>
                <View style={styles.confirmDetailRow}>
                  <View style={styles.confirmDetailLeft}>
                    <Ionicons name="calendar-outline" size={18} color={Colors.gray[600]} />
                    <Text style={styles.confirmDetailLabel}>Date de fin</Text>
                  </View>
                  <Text style={styles.confirmDetailValue}>{formattedRecurringEndDate}</Text>
                </View>
              </>
            ) : null}
            <View style={styles.confirmDetailRow}>
              <View style={styles.confirmDetailLeft}>
                <Ionicons name="people" size={18} color={Colors.gray[600]} />
                <Text style={styles.confirmDetailLabel}>Places</Text>
              </View>
              <Text style={styles.confirmDetailValue}>{seats}</Text>
            </View>
            <View style={styles.confirmDetailRow}>
              <View style={styles.confirmDetailLeft}>
                <Ionicons name="cash" size={18} color={Colors.gray[600]} />
                <Text style={styles.confirmDetailLabel}>Prix</Text>
              </View>
              <Text style={[styles.confirmDetailValue, { color: Colors.success }]}>
                {isFreeTrip ? 'Gratuit' : `${price} FC/pers`}
              </Text>
            </View>
            <View style={styles.confirmDetailRow}>
              <View style={styles.confirmDetailLeft}>
                <Ionicons name="shield-checkmark-outline" size={18} color={Colors.gray[600]} />
                <Text style={styles.confirmDetailLabel}>Identité des passagers</Text>
              </View>
              <Text
                style={[
                  styles.confirmDetailValue,
                  requiresPassengerKyc && { color: Colors.primary },
                ]}
              >
                {requiresPassengerKyc ? 'Requis' : 'Non requis'}
              </Text>
            </View>
            {description ? (
              <View style={[styles.confirmDetailRow, styles.confirmDetailRowMultiline]}>
                <View style={styles.confirmDetailLeft}>
                  <Ionicons name="chatbox-ellipses" size={18} color={Colors.gray[600]} />
                  <Text style={styles.confirmDetailLabel}>Description</Text>
                </View>
                <Text style={[styles.confirmDetailValue, styles.confirmDetailDescription]}>{description}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => goToStep('pricing')}
        >
          <Text style={styles.buttonSecondaryText}>Retour</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.button,
            { flex: 1, marginLeft: Spacing.md },
            (isSubmittingTrip || !isPublishIdentityVerified) && styles.buttonDisabled,
          ]}
          onPress={handlePublish}
          disabled={isSubmittingTrip || !isPublishIdentityVerified}
        >
          {isSubmittingTrip ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.buttonText}>
              {isPublishIdentityVerified
                ? isRecurringTrip
                  ? 'Publier les trajets'
                  : 'Publier'
                : 'Identité à vérifier'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
