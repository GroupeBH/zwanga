import type { ManualGeocodeStatus } from '@/utils/manualAddressGeocode';
import type { MapLocationSelection } from '@/components/LocationPickerModal';
import type { RoutePointStatus } from '@/features/publish/publishModel';
import { PublishRouteFields } from './PublishRouteFields';
import { styles } from '../screen-styles/app/publish/index';
import { Colors } from '@/constants/styles';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface PublishRouteStepProps {
  stepEntering: FadeInDown | undefined;
  hasDepartureCoordinates: boolean;
  setManualAddressTarget: React.Dispatch<React.SetStateAction<"departure" | "arrival" | null>>;
  openLocationPicker: (type: "departure" | "arrival", initialQuery?: string) => void;
  hasDepartureAddress: boolean;
  departureLocation: MapLocationSelection | null;
  departureManualAddress: string;
  manualAddressTarget: "departure" | "arrival" | null;
  departureTouchedRef: React.RefObject<boolean>;
  setDepartureManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setDepartureLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setDeparturePointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  departureManualGeocodeStatus: ManualGeocodeStatus;
  renderGpsStatus: (hasAddress: boolean, hasGpsSuggestion: boolean, isConfirmed: boolean, label: string) => React.JSX.Element | null;
  hasDepartureGpsSuggestion: boolean;
  shouldShowDepartureReference: boolean;
  departureReference: string;
  setShowDepartureReference: React.Dispatch<React.SetStateAction<boolean>>;
  setDepartureReference: React.Dispatch<React.SetStateAction<string>>;
  swapRoutePoints: () => void;
  hasArrivalCoordinates: boolean;
  hasArrivalAddress: boolean;
  arrivalLocation: MapLocationSelection | null;
  arrivalManualAddress: string;
  setArrivalManualAddress: React.Dispatch<React.SetStateAction<string>>;
  setArrivalLocation: React.Dispatch<React.SetStateAction<MapLocationSelection | null>>;
  setArrivalPointStatus: React.Dispatch<React.SetStateAction<RoutePointStatus>>;
  arrivalManualGeocodeStatus: ManualGeocodeStatus;
  hasArrivalGpsSuggestion: boolean;
  shouldShowArrivalReference: boolean;
  arrivalReference: string;
  setShowArrivalReference: React.Dispatch<React.SetStateAction<boolean>>;
  setArrivalReference: React.Dispatch<React.SetStateAction<string>>;
  showQuickLandmarks: boolean;
  setShowQuickLandmarks: React.Dispatch<React.SetStateAction<boolean>>;
  isPublishIdentityVerified: boolean;
  handleStartKyc: () => Promise<void>;
}

export function PublishRouteStep({
  stepEntering,
  hasDepartureCoordinates,
  setManualAddressTarget,
  openLocationPicker,
  hasDepartureAddress,
  departureLocation,
  departureManualAddress,
  manualAddressTarget,
  departureTouchedRef,
  setDepartureManualAddress,
  setDepartureLocation,
  setDeparturePointStatus,
  departureManualGeocodeStatus,
  renderGpsStatus,
  hasDepartureGpsSuggestion,
  shouldShowDepartureReference,
  departureReference,
  setShowDepartureReference,
  setDepartureReference,
  swapRoutePoints,
  hasArrivalCoordinates,
  hasArrivalAddress,
  arrivalLocation,
  arrivalManualAddress,
  setArrivalManualAddress,
  setArrivalLocation,
  setArrivalPointStatus,
  arrivalManualGeocodeStatus,
  hasArrivalGpsSuggestion,
  shouldShowArrivalReference,
  arrivalReference,
  setShowArrivalReference,
  setArrivalReference,
  showQuickLandmarks,
  setShowQuickLandmarks,
  isPublishIdentityVerified,
  handleStartKyc,
}: PublishRouteStepProps) {
  return (
    <Animated.View entering={stepEntering} style={[styles.stepContainer, styles.routeStepContainer]}>
      <View style={styles.publishRouteSheet}>
        <View style={styles.rideSheetHeader}>
          <View style={styles.routeSheetHeaderCopy}>
            <Text style={styles.sectionTitle}>Votre itinéraire</Text>
            <Text style={styles.routeSheetSubtitle} numberOfLines={1}>
              Choisissez le départ et la destination sur la carte
            </Text>
          </View>
        </View>

      {/* Carte récap itinéraire */}
      <PublishRouteFields
        hasDepartureCoordinates={hasDepartureCoordinates}
        setManualAddressTarget={setManualAddressTarget}
        openLocationPicker={openLocationPicker}
        hasDepartureAddress={hasDepartureAddress}
        departureLocation={departureLocation}
        departureManualAddress={departureManualAddress}
        manualAddressTarget={manualAddressTarget}
        departureTouchedRef={departureTouchedRef}
        setDepartureManualAddress={setDepartureManualAddress}
        setDepartureLocation={setDepartureLocation}
        setDeparturePointStatus={setDeparturePointStatus}
        departureManualGeocodeStatus={departureManualGeocodeStatus}
        renderGpsStatus={renderGpsStatus}
        hasDepartureGpsSuggestion={hasDepartureGpsSuggestion}
        shouldShowDepartureReference={shouldShowDepartureReference}
        departureReference={departureReference}
        setShowDepartureReference={setShowDepartureReference}
        setDepartureReference={setDepartureReference}
        swapRoutePoints={swapRoutePoints}
        hasArrivalCoordinates={hasArrivalCoordinates}
        hasArrivalAddress={hasArrivalAddress}
        arrivalLocation={arrivalLocation}
        arrivalManualAddress={arrivalManualAddress}
        setArrivalManualAddress={setArrivalManualAddress}
        setArrivalLocation={setArrivalLocation}
        setArrivalPointStatus={setArrivalPointStatus}
        arrivalManualGeocodeStatus={arrivalManualGeocodeStatus}
        hasArrivalGpsSuggestion={hasArrivalGpsSuggestion}
        shouldShowArrivalReference={shouldShowArrivalReference}
        arrivalReference={arrivalReference}
        setShowArrivalReference={setShowArrivalReference}
        setArrivalReference={setArrivalReference}
      />

      {!showQuickLandmarks && (
        <TouchableOpacity
          style={styles.quickLandmarksOpenButton}
          onPress={() => setShowQuickLandmarks(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="navigate-outline" size={15} color={Colors.primary} />
          <Text style={styles.quickLandmarksOpenText}>Repères rapides</Text>
          <Ionicons name="chevron-down" size={15} color={Colors.gray[500]} />
        </TouchableOpacity>
      )}

      {/* Repères rapides Kinshasa */}
      {showQuickLandmarks && (
        <View style={styles.quickLandmarksSection}>
          <View style={styles.quickLandmarksHeader}>
            <Ionicons name="navigate" size={14} color={Colors.primary} />
            <Text style={styles.quickLandmarksTitle}>Repères rapides</Text>
            <TouchableOpacity
              style={styles.quickLandmarksToggle}
              onPress={() => setShowQuickLandmarks(false)}
            >
              <Ionicons name="chevron-up" size={16} color={Colors.gray[500]} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickLandmarksScroll}
          >
            {[
              { name: 'Gare Centrale', commune: 'Gombe' },
              { name: 'Marché Zando', commune: 'Kalamu' },
              { name: 'Rond-point Victoire', commune: 'Lingwala' },
              { name: 'UPN', commune: 'Lemba' },
              { name: 'Kintambo Magasin', commune: 'Kintambo' },
              { name: 'Bandal Tshibangu', commune: 'Bandalungwa' },
              { name: 'Mont-Ngafula', commune: 'Mont-Ngafula' },
              { name: 'Kasa-Vubu', commune: 'Kasa-Vubu' },
              { name: 'Ndjili', commune: 'Ndjili' },
              { name: 'Matete', commune: 'Matete' },
            ].map((place) => (
              <TouchableOpacity
                key={place.name}
                style={styles.quickLandmarkChip}
                onPress={() => {
                  const target = !hasDepartureCoordinates ? 'departure' : 'arrival';
                  setManualAddressTarget(null);
                  openLocationPicker(target, `${place.name}, ${place.commune}, Kinshasa`);
                }}
              >
                <Ionicons name="location" size={12} color={Colors.primary} />
                <Text style={styles.quickLandmarkText} numberOfLines={1}>
                  {place.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* KYC Warning si non vérifié */}
      {!isPublishIdentityVerified && (
        <TouchableOpacity
          style={styles.inlineKycBanner}
          onPress={handleStartKyc}
          activeOpacity={0.85}
        >
          <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.inlineKycTitle}>Vérifiez votre identité pour publier</Text>
            <Text style={styles.inlineKycSubtitle}>
              Vérifiez votre identité en moins de 5 min
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
        </TouchableOpacity>
      )}

      </View>
    </Animated.View>
  );
}
