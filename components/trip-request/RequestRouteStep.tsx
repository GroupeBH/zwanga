import { ManualAddressStatus } from '@/components/address/ManualAddressStatus';
import { Colors } from '@/constants/styles';
import { REGISTERED_VEHICLE_TYPE_OPTIONS } from '@/constants/vehicleTypes';
import { favoriteIcon, POPULAR_PLACES } from '@/features/trip-request/requestFormModel';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import Animated, { FadeIn } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'addressInputMode' | 'addressSectionStep' | 'applyQuickPlaceToNextSlot' | 'applySelectionToNextSlot' | 'arrivalAddress' | 'arrivalManualAddress' | 'arrivalManualGeocodeStatus' | 'departureAddress' | 'departureManualAddress' | 'departureManualGeocodeStatus' | 'departureTouchedRef' | 'favoriteSuggestions' | 'hasArrivalAddress' | 'hasDepartureAddress' | 'openPickerFor' | 'quickPlaceResolvingKey' | 'selectedVehicleType' | 'setArrivalLocation' | 'setArrivalManualAddress' | 'setDepartureLocation' | 'setDepartureManualAddress' | 'setSelectedVehicleType' | 'setShowQuickLandmarks' | 'showQuickLandmarks' | 'swapRoutePoints'>;

export function RequestRouteStep({
  addressInputMode,
  addressSectionStep,
  applyQuickPlaceToNextSlot,
  applySelectionToNextSlot,
  arrivalAddress,
  arrivalManualAddress,
  arrivalManualGeocodeStatus,
  departureAddress,
  departureManualAddress,
  departureManualGeocodeStatus,
  departureTouchedRef,
  favoriteSuggestions,
  hasArrivalAddress,
  hasDepartureAddress,
  openPickerFor,
  quickPlaceResolvingKey,
  selectedVehicleType,
  setArrivalLocation,
  setArrivalManualAddress,
  setDepartureLocation,
  setDepartureManualAddress,
  setSelectedVehicleType,
  setShowQuickLandmarks,
  showQuickLandmarks,
  swapRoutePoints
}: Props) {
  return (<Animated.View entering={FadeIn} style={styles.routeSetup}>
    <View style={styles.routeSetupHeader}>
      <Text style={styles.routeSetupTitle}>Votre trajet</Text>
      <TouchableOpacity style={styles.routeSetupSwap} onPress={swapRoutePoints} activeOpacity={0.85}>
        <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
      </TouchableOpacity>
    </View>

    <View style={styles.routeInputStack}>
      <View style={styles.routePickerItem}>
        <TouchableOpacity
          style={styles.routePickerButton}
          onPress={() => openPickerFor('departure')}
          activeOpacity={0.88}
        >
          <View style={[styles.routePickerIcon, styles.routePickerIconStart]}>
            <Ionicons name="navigate" size={18} color={Colors.success} />
          </View>
          <View style={styles.routePickerCopy}>
            <Text style={styles.routePickerLabel}>Départ</Text>
            <Text
              style={[styles.routePickerValue, !hasDepartureAddress && styles.routePickerPlaceholder]}
              numberOfLines={1}
            >
              {departureAddress || 'Point de départ'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
        </TouchableOpacity>
        {addressInputMode === 'manual' && addressSectionStep === 'departure' ? (
          <View style={styles.routeManualWrap}>
            <TextInput
              style={styles.routeManualInput}
              value={departureManualAddress}
              onChangeText={(value) => {
                departureTouchedRef.current = true;
                setDepartureManualAddress(value);
                setDepartureLocation(null);
              }}
              placeholder="Saisir le départ"
              placeholderTextColor={Colors.gray[400]}
            />
            <ManualAddressStatus status={departureManualGeocodeStatus} appearance={styles} />
          </View>
        ) : null}
      </View>

      <View style={styles.routeStackDivider} />

      <View style={styles.routePickerItem}>
        <TouchableOpacity
          style={styles.routePickerButton}
          onPress={() => openPickerFor('arrival')}
          activeOpacity={0.88}
        >
          <View style={[styles.routePickerIcon, styles.routePickerIconEnd]}>
            <Ionicons name="flag" size={18} color={Colors.primary} />
          </View>
          <View style={styles.routePickerCopy}>
            <Text style={styles.routePickerLabel}>Destination</Text>
            <Text
              style={[styles.routePickerValue, !hasArrivalAddress && styles.routePickerPlaceholder]}
              numberOfLines={1}
            >
              {arrivalAddress || 'Point d’arrivée'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
        </TouchableOpacity>
        {addressInputMode === 'manual' && addressSectionStep === 'arrival' ? (
          <View style={styles.routeManualWrap}>
            <TextInput
              style={styles.routeManualInput}
              value={arrivalManualAddress}
              onChangeText={(value) => {
                setArrivalManualAddress(value);
                setArrivalLocation(null);
              }}
              placeholder="Saisir la destination"
              placeholderTextColor={Colors.gray[400]}
            />
            <ManualAddressStatus status={arrivalManualGeocodeStatus} appearance={styles} />
          </View>
        ) : null}
      </View>
    </View>

    <View style={styles.routeSuggestions}>
      <View style={styles.suggestionsHeader}>
        <Text style={styles.suggestionsTitle}>Lieux rapides</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={showQuickLandmarks ? 'Masquer les lieux rapides' : 'Afficher les lieux rapides'}
          style={styles.suggestionsToggleButton}
          onPress={() => setShowQuickLandmarks((value) => !value)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.suggestionsToggle}>{showQuickLandmarks ? 'Masquer' : 'Afficher'}</Text>
        </TouchableOpacity>
      </View>
      {showQuickLandmarks ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestionsScroll}
        >
          {favoriteSuggestions.map((favorite) => (
            <TouchableOpacity
              key={favorite.id}
              style={styles.suggestionChip}
              onPress={() =>
                applySelectionToNextSlot({
                  title: favorite.name,
                  address: favorite.address,
                  latitude: favorite.coordinates.latitude,
                  longitude: favorite.coordinates.longitude,
                })
              }
              activeOpacity={0.86}
            >
              <View style={styles.suggestionIcon}>
                <Ionicons name={favoriteIcon(favorite.type)} size={14} color={Colors.primary} />
              </View>
              <Text style={styles.suggestionText} numberOfLines={1}>
                {favorite.name}
              </Text>
            </TouchableOpacity>
          ))}
          {POPULAR_PLACES.map((place) => {
            const placeLabel = `${place.name}, ${place.commune}`;
            const isResolving = quickPlaceResolvingKey === placeLabel;

            return (
              <TouchableOpacity
                key={place.name}
                style={[
                  styles.suggestionChip,
                  quickPlaceResolvingKey && !isResolving && styles.suggestionChipDisabled,
                ]}
                onPress={() => {
                  void applyQuickPlaceToNextSlot(placeLabel);
                }}
                disabled={Boolean(quickPlaceResolvingKey)}
                activeOpacity={0.86}
              >
                <View style={styles.suggestionIcon}>
                  {isResolving ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Ionicons name="location" size={14} color={Colors.primary} />
                  )}
                </View>
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {place.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>

    <View style={styles.routeVehicleChoice}>
      <View style={styles.routeVehicleChoiceHeader}>
        <Text style={styles.routeVehicleChoiceTitle}>Type de véhicule</Text>
        <Text style={styles.routeVehicleChoiceSubtitle}>
          Choisissez le véhicule souhaité pour ce trajet
        </Text>
      </View>
      <View style={styles.routeVehicleChoiceRow}>
        {REGISTERED_VEHICLE_TYPE_OPTIONS.map((option) => {
          const selected = selectedVehicleType === option.id;

          return (
            <TouchableOpacity
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              activeOpacity={0.82}
              style={[
                styles.routeVehicleChoiceOption,
                selected && styles.routeVehicleChoiceOptionSelected,
              ]}
              onPress={() => setSelectedVehicleType(option.id)}
            >
              <View
                style={[
                  styles.routeVehicleChoiceIcon,
                  selected && styles.routeVehicleChoiceIconSelected,
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={21}
                  color={selected ? Colors.primary : Colors.gray[500]}
                />
              </View>
              <Text
                style={[
                  styles.routeVehicleChoiceLabel,
                  selected && styles.routeVehicleChoiceLabelSelected,
                ]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
              {selected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={17}
                  color={Colors.primary}
                  style={styles.routeVehicleChoiceCheck}
                />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>

  </Animated.View>);
}
