import { RoutePointStatus } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import { ManualAddressStatus } from '@/components/address/ManualAddressStatus';
import { MapLocationSelection } from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

interface PublishRouteFieldsProps {
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
}

export function PublishRouteFields({
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
}: PublishRouteFieldsProps) {
  return (
    <View style={styles.routeCard}>
      <View style={styles.routeVisual}>
        <View style={styles.dotGreen} />
        <View style={styles.routeLine} />
        <View style={styles.dotBlue} />
      </View>
      <View style={styles.routeInputs}>
        {/* Départ */}
        <View style={[styles.addressField, hasDepartureCoordinates && styles.addressFieldDepartureReady]}>
          <Text style={[styles.addressFieldLabel, hasDepartureCoordinates && styles.addressFieldLabelReady]}>
            Départ
          </Text>
          <View style={styles.addressInputRow}>
            <TouchableOpacity
              style={[
                styles.addressInputButton,
                hasDepartureCoordinates && styles.addressInputButtonDepartureActive,
              ]}
              onPress={() => {
                setManualAddressTarget(null);
                openLocationPicker('departure');
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={hasDepartureCoordinates ? "location" : "location-outline"}
                size={18}
                color={hasDepartureCoordinates ? Colors.success : Colors.gray[500]}
              />
              <Text
                style={[
                  styles.addressInputText,
                  hasDepartureAddress && styles.addressInputTextActive,
                ]}
                numberOfLines={1}
              >
                {departureLocation?.title || departureManualAddress || 'Choisir sur la carte'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggle,
                manualAddressTarget === 'departure' && styles.modeToggleActive,
              ]}
              onPress={() => {
                departureTouchedRef.current = true;
                setManualAddressTarget(
                  manualAddressTarget === 'departure' ? null : 'departure',
                );
              }}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={manualAddressTarget === 'departure' ? Colors.primary : Colors.gray[500]}
              />
            </TouchableOpacity>
          </View>
          {manualAddressTarget === 'departure' && (
            <>
              <TextInput
                style={styles.inlineManualInput}
                value={departureManualAddress}
                onChangeText={(value) => {
                  departureTouchedRef.current = true;
                  setDepartureManualAddress(value);
                  setDepartureLocation(null);
                  setDeparturePointStatus(null);
                }}
                placeholder="Ex: avenue Kasa-Vubu, Bandal"
                placeholderTextColor={Colors.gray[400]}
              />
              <ManualAddressStatus status={departureManualGeocodeStatus} appearance={styles} foundLabel="Coordonnées trouvées, vérifiez sur la carte" />
            </>
          )}
          {renderGpsStatus(
            hasDepartureAddress,
            hasDepartureGpsSuggestion,
            hasDepartureCoordinates,
            'Départ',
          )}
          {shouldShowDepartureReference ? (
            <View style={styles.referenceField}>
              <View style={styles.referenceHeader}>
                <Text style={styles.referenceLabel}>Repère de départ</Text>
                {!departureReference.trim() && (
                  <TouchableOpacity onPress={() => setShowDepartureReference(false)}>
                    <Ionicons name="close" size={16} color={Colors.gray[500]} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.referenceInput}
                value={departureReference}
                onChangeText={setDepartureReference}
                placeholder="Ex: station, portail bleu"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.referenceAddButton}
              onPress={() => setShowDepartureReference(true)}
            >
              <Ionicons name="add" size={15} color={Colors.gray[600]} />
              <Text style={styles.referenceAddText}>Ajouter un repère</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Swap button */}
        <TouchableOpacity
          style={styles.swapButton}
          onPress={swapRoutePoints}
        >
          <View style={styles.swapButtonInner}>
            <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
          </View>
        </TouchableOpacity>

        {/* Arrivée */}
        <View style={[styles.addressField, hasArrivalCoordinates && styles.addressFieldArrivalReady]}>
          <Text style={[styles.addressFieldLabel, hasArrivalCoordinates && styles.addressFieldLabelReady]}>
            Arrivée
          </Text>
          <View style={styles.addressInputRow}>
            <TouchableOpacity
              style={[
                styles.addressInputButton,
                hasArrivalCoordinates && styles.addressInputButtonArrivalActive,
              ]}
              onPress={() => {
                setManualAddressTarget(null);
                openLocationPicker('arrival');
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name={hasArrivalCoordinates ? "navigate" : "navigate-outline"}
                size={18}
                color={hasArrivalCoordinates ? Colors.primary : Colors.gray[500]}
              />
              <Text
                style={[
                  styles.addressInputText,
                  hasArrivalAddress && styles.addressInputTextActive,
                ]}
                numberOfLines={1}
              >
                {arrivalLocation?.title || arrivalManualAddress || 'Choisir sur la carte'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggle,
                manualAddressTarget === 'arrival' && styles.modeToggleActive,
              ]}
              onPress={() => {
                setManualAddressTarget(
                  manualAddressTarget === 'arrival' ? null : 'arrival',
                );
              }}
            >
              <Ionicons
                name="create-outline"
                size={16}
                color={manualAddressTarget === 'arrival' ? Colors.primary : Colors.gray[500]}
              />
            </TouchableOpacity>
          </View>
          {manualAddressTarget === 'arrival' && (
            <>
              <TextInput
                style={styles.inlineManualInput}
                value={arrivalManualAddress}
                onChangeText={(value) => {
                  setArrivalManualAddress(value);
                  setArrivalLocation(null);
                  setArrivalPointStatus(null);
                }}
                placeholder="Ex: rond-point Victoire"
                placeholderTextColor={Colors.gray[400]}
              />
              <ManualAddressStatus status={arrivalManualGeocodeStatus} appearance={styles} foundLabel="Coordonnées trouvées, vérifiez sur la carte" />
            </>
          )}
          {renderGpsStatus(
            hasArrivalAddress,
            hasArrivalGpsSuggestion,
            hasArrivalCoordinates,
            'Arrivée',
          )}
          {shouldShowArrivalReference ? (
            <View style={styles.referenceField}>
              <View style={styles.referenceHeader}>
                <Text style={styles.referenceLabel}>Repère d’arrivée</Text>
                {!arrivalReference.trim() && (
                  <TouchableOpacity onPress={() => setShowArrivalReference(false)}>
                    <Ionicons name="close" size={16} color={Colors.gray[500]} />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.referenceInput}
                value={arrivalReference}
                onChangeText={setArrivalReference}
                placeholder="Ex: entrée principale"
                placeholderTextColor={Colors.gray[400]}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.referenceAddButton}
              onPress={() => setShowArrivalReference(true)}
            >
              <Ionicons name="add" size={15} color={Colors.gray[600]} />
              <Text style={styles.referenceAddText}>Ajouter un repère</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
import type { ManualGeocodeStatus } from '@/utils/manualAddressGeocode';
