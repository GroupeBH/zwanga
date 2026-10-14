import { usePassengerNavigationController } from '../../../hooks/passenger-navigation/usePassengerNavigationController';
import { PassengerNavigationMap } from '../../../features/passenger-navigation/PassengerNavigationMap';
import { PassengerNavigationInfoCard } from '../../../features/passenger-navigation/PassengerNavigationInfoCard';
import { PassengerNavigationHeader } from '@/features/passenger-navigation/PassengerNavigationHeader';
import { PassengerMapControls } from '@/features/passenger-navigation/PassengerMapControls';
import { NavigationAssistanceModals } from '@/features/navigation/NavigationAssistanceModals';
import { useNavigationAssistance } from '@/hooks/navigation/useNavigationAssistance';
import { styles } from '../../../features/screen-styles/app/booking/navigate/detail/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, StatusBar, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { RideOverlayScope } from '@/features/navigation/RideOverlayProvider';
import { RideActionResult } from '@/features/ride-recovery/RideActionResult';
import { PassengerPickupNotice } from '@/features/passenger-navigation/PassengerPickupNotice';

export default function PassengerNavigationScreen() {
  const { height } = useWindowDimensions();
  const model = usePassengerNavigationController();
  const assistance = useNavigationAssistance({ role: 'passenger', trip: model.data.trip,
    booking: model.data.booking, isScreenActive: model.data.isScreenActive });

  // Loading
  if ((model.data.bookingLoading && !model.data.booking) || (model.data.tripLoading && !model.data.trip)) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  // Erreur
  if (!model.data.booking || !model.data.trip) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="dark-content" />
        <Ionicons name="alert-circle" size={64} color={Colors.danger} />
        <Text style={styles.errorText}>Réservation introuvable</Text>
        <TouchableOpacity style={styles.backButton} onPress={model.state.navigateBackSafely}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <RideOverlayScope scopeKey={`passenger:${model.data.bookingId}`} active={model.data.isScreenActive}>
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <ScrollView style={{ maxHeight: height * 0.4, flexGrow: 0 }} showsVerticalScrollIndicator>
        <PassengerNavigationHeader model={model} assistance={assistance} />
        <PassengerPickupNotice model={model} hidden={assistance.isOpen} />
        <RideActionResult actor="passenger" tripId={model.data.tripId} bookingId={model.data.bookingId} active={model.data.isScreenActive} />
      </ScrollView>
      
      {/* Carte */}
      <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {model.state.isNavigationMapReady ? (
        <PassengerNavigationMap
          state={model.state}
          camera={model.camera}
          context={model.context}
          handleTrackingMarkerReady={model.handleTrackingMarkerReady}
          driverCamera={model.driverCamera}
          data={model.data}
          coordinates={model.coordinates}
          presentation={model.presentation}
        />
      ) : (
        <View style={[styles.map, styles.mapPlaceholder]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.mapPlaceholderText}>Préparation de la navigation...</Text>
        </View>
      )}

      {model.presentation.canToggleRouteSegments && (
        <View style={[styles.segmentToggle, { top: 8, right: undefined, left: Math.max(model.data.insets.left, Spacing.md) }]}>
          <TouchableOpacity
            style={[
              styles.segmentToggleButton,
              model.state.activeRouteSegment === 'route' && styles.segmentToggleButtonActive,
            ]}
            onPress={() => model.state.setActiveRouteSegment('route')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="git-branch-outline"
              size={15}
              color={model.state.activeRouteSegment === 'route' ? Colors.white : Colors.primaryDark}
            />
            <Text
              style={[
                styles.segmentToggleText,
                model.state.activeRouteSegment === 'route' && styles.segmentToggleTextActive,
              ]}
            >
              Trajet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentToggleButton,
              model.state.activeRouteSegment === 'pickup' && styles.segmentToggleButtonPickupActive,
            ]}
            onPress={() => model.state.setActiveRouteSegment('pickup')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="person-outline"
              size={15}
              color={model.state.activeRouteSegment === 'pickup' ? Colors.white : Colors.infoDark}
            />
            <Text
              style={[
                styles.segmentToggleText,
                model.state.activeRouteSegment === 'pickup' && styles.segmentToggleTextActive,
              ]}
            >
              Prise en charge
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <PassengerMapControls model={model} />
      </View>

      {/* Info Card */}
      {!model.state.isMapExpanded && (
      <PassengerNavigationInfoCard
        key={model.data.bookingId}
        data={model.data}
        state={model.state}
        presentation={model.presentation}
        interruption={model.interruption}
        tripActions={model.tripActions}
      />
      )}

      <NavigationAssistanceModals assistance={assistance} role="passenger" insets={model.data.insets} />
    </View>
    </RideOverlayScope>
  );
}
