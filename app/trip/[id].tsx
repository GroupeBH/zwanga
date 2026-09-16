import { TripDetailMapPreview } from '../../features/trip-detail/TripDetailMapPreview';
import { useTripDetailController } from '../../hooks/trip-detail/useTripDetailController';
import { TripDetailContentSheet } from '../../features/trip-detail/TripDetailContentSheet';
import { TripDetailActionsFooter } from '../../features/trip-detail/TripDetailActionsFooter';
import { TripImageModal } from '../../features/trip-detail/TripImageModal';
import { TripContactModal } from '../../features/trip-detail/TripContactModal';
import { TripReviewsModal } from '../../features/trip-detail/TripReviewsModal';
import { TripEditModal } from '../../features/trip-detail/TripEditModal';
import { TripBookingSuccessModal } from '../../features/trip-detail/TripBookingSuccessModal';
import { TripMapModal } from '../../features/trip-detail/TripMapModal';
import { TripBookingModal } from '../../features/trip-detail/TripBookingModal';
import { TripRelativesModal } from '../../features/trip-detail/TripRelativesModal';
import { TripSosModal } from '../../features/trip-detail/TripSosModal';
import { TripVehicleDetailsModal } from '../../features/trip-detail/TripVehicleDetailsModal';
import { styles } from '../../features/screen-styles/app/trip/detail/index';
import LocationPickerModal from '@/components/LocationPickerModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TripDetailsScreen() {
  const model = useTripDetailController();

  // Early return AFTER all hooks to avoid hook order violation
  if (model.data.tripLoading && !model.data.trip) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.emptyStateContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptyStateTitle}>Chargement du trajet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!model.data.trip && !model.data.tripLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons name="car-sport" size={32} color={Colors.primary} />
          </View>
          <Text style={styles.emptyStateTitle}>Trajet introuvable</Text>
          <Text style={styles.emptyStateText}>
            Ce trajet n&apos;existe plus ou a été supprimé par son propriétaire.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={model.data.goHome}>
            <Ionicons name="arrow-back" size={16} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View
        pointerEvents="box-none"
        style={[
          styles.header,
          model.hasRenderableTripMap && styles.headerFloating,
          model.hasRenderableTripMap && { paddingTop: model.presentation.headerFloatingOffset },
        ]}
      >
        <View pointerEvents="box-none" style={styles.headerTop}>
          <TouchableOpacity
            onPress={model.data.goHome}
            style={styles.headerCircleButton}
            activeOpacity={0.85}
            hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, model.hasRenderableTripMap && styles.headerTitleFloating]}>
            Détails du trajet
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={model.safety.openTripSecurityModal}
              style={[styles.shareButton, !model.access.canAccessTripSecurity && styles.shareButtonDisabled]}
              disabled={!model.access.canAccessTripSecurity}
              activeOpacity={0.85}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={22}
                color={model.access.canAccessTripSecurity ? Colors.primary : Colors.gray[400]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void model.contact.handleShareTrip()}
              style={[
                styles.shareButton,
                model.bookingState.isCreatingTripShareLink && styles.shareButtonDisabled,
              ]}
              disabled={model.bookingState.isCreatingTripShareLink}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Partager le trajet"
            >
              {model.bookingState.isCreatingTripShareLink ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={model.bookingState.refreshing} onRefresh={model.activity.onRefresh} tintColor={Colors.primary} />
        }
      >
        {model.hasRenderableTripMap && !model.bookingState.isDetailMapReady && (
          <View style={styles.mapContainer}>
            <View
              style={[
                styles.mapPreview,
                styles.mapLoadingPlaceholder,
                { height: Math.min(214, Math.max(172, model.data.viewportHeight * 0.27)) },
              ]}
            >
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.mapLoadingText}>Préparation de la carte...</Text>
            </View>
          </View>
        )}

        {/* Carte interactive - masquée quand le trajet est en cours */}
        {model.canRenderTripMap && !model.bookingState.mapModalVisible && (
          <TripDetailMapPreview
            model={model}
          />
        )}

        {/* Modal carte plein écran - masqué quand le trajet est en cours */}
        {model.canRenderTripMap && model.bookingState.mapModalVisible && (
          <TripMapModal
            mapModalVisible={model.bookingState.mapModalVisible}
            setMapModalVisible={model.bookingState.setMapModalVisible}
            insets={model.data.insets}
            mapRegion={model.mapPresentation.mapRegion}
            routeMapCoordinates={model.mapPresentation.routeMapCoordinates}
            hasDetailedRouteMapCoordinates={model.mapPresentation.hasDetailedRouteMapCoordinates}
            departureCoordinate={model.route.departureCoordinate}
            trip={model.data.trip}
            arrivalCoordinate={model.route.arrivalCoordinate}
            passengerDestinationMarkers={model.mapPresentation.passengerDestinationMarkers}
          />
        )}

        <TripDetailContentSheet
          hasRenderableTripMap={model.hasRenderableTripMap}
          config={model.config}
          presentation={model.presentation}
          data={model.data}
          access={model.access}
          bookingState={model.bookingState}
          activity={model.activity}
          contact={model.contact}
          safety={model.safety}
        />
      </ScrollView>

      {/* Sticky Footer for Actions */}
      <TripDetailActionsFooter
        data={model.data}
        access={model.access}
        activity={model.activity}
        editor={model.editing.editor}
        pricing={model.pricing}
        payment={model.payment}
        bookingState={model.bookingState}
        bookingSubmission={model.bookingSubmission}
        bookingLocation={model.bookingLocation}
      />

      <TripVehicleDetailsModal
        vehicleDetailModalVisible={model.bookingState.vehicleDetailModalVisible}
        setVehicleDetailModalVisible={model.bookingState.setVehicleDetailModalVisible}
        insets={model.data.insets}
        trip={model.data.trip}
        tripVehicleIconName={model.presentation.tripVehicleIconName}
        tripVehicleLabel={model.presentation.tripVehicleLabel}
        tripVehicleTypeLabel={model.presentation.tripVehicleTypeLabel}
        tripVehicleStatusLabel={model.presentation.tripVehicleStatusLabel}
        tripVehicleLicensePlate={model.presentation.tripVehicleLicensePlate}
        visibleTripVehicleDetailRows={model.presentation.visibleTripVehicleDetailRows}
      />

      <TripSosModal
        sosModalVisible={model.bookingState.sosModalVisible}
        closeSosModal={model.safety.closeSosModal}
        insets={model.data.insets}
      />

      <TripRelativesModal
        securityModalVisible={model.bookingState.securityModalVisible}
        closeTripSecurityModal={model.safety.closeTripSecurityModal}
        insets={model.data.insets}
        trip={model.data.trip}
        tripSecurityRole={model.access.tripSecurityRole}
        tripSecurityBookingId={model.access.tripSecurityBookingId}
      />

      <TripBookingModal
        bookingModalVisible={model.bookingState.bookingModalVisible}
        insets={model.data.insets}
        bookingStep={model.bookingState.bookingStep}
        viewportHeight={model.data.viewportHeight}
        adjustBookingSeats={model.pricing.adjustBookingSeats}
        isBooking={model.bookingState.isBooking}
        bookingSeats={model.bookingState.bookingSeats}
        handleBookingSeatsChange={model.pricing.handleBookingSeatsChange}
        seatLimit={model.access.seatLimit}
        isIdentityVerified={model.data.isIdentityVerified}
        openPassengerIdentityVerification={model.access.openPassengerIdentityVerification}
        estimatedTotal={model.pricing.estimatedTotal}
        bookingPaymentMode={model.bookingState.bookingPaymentMode}
        setBookingPaymentMode={model.bookingState.setBookingPaymentMode}
        openBookingLocationPicker={model.wizard.openBookingLocationPicker}
        passengerOriginDisplay={model.bookingLocation.passengerOriginDisplay}
        passengerOriginManualAddress={model.bookingState.passengerOriginManualAddress}
        setPassengerOriginManualAddress={model.bookingState.setPassengerOriginManualAddress}
        setShouldAutofillPassengerOrigin={model.bookingState.setShouldAutofillPassengerOrigin}
        setPassengerOrigin={model.bookingState.setPassengerOrigin}
        isValidatingDestination={model.bookingState.isValidatingDestination}
        passengerDestinationDisplay={model.bookingLocation.passengerDestinationDisplay}
        passengerDestinationManualAddress={model.bookingState.passengerDestinationManualAddress}
        setPassengerDestinationManualAddress={model.bookingState.setPassengerDestinationManualAddress}
        setPassengerDestination={model.bookingState.setPassengerDestination}
        trip={model.data.trip}
        bookingModalError={model.bookingState.bookingModalError}
        closeBookingModal={model.wizard.closeBookingModal}
        goToPreviousBookingStep={model.wizard.goToPreviousBookingStep}
        goToNextBookingStep={model.wizard.goToNextBookingStep}
        handleConfirmBooking={model.bookingSubmission.handleConfirmBooking}
      />

      {/* Location Picker pour le point de récupération */}
      <LocationPickerModal
        visible={model.bookingState.showOriginPicker}
        title="Mon point de récupération"
        initialLocation={model.bookingState.passengerOrigin}
        routeCoordinates={model.bookingState.routeCoordinates || undefined}
        restrictToRoute={true}
        onClose={model.wizard.restoreBookingModalAfterLocationPicker}
        onSelect={(location) => {
          model.bookingState.setPassengerOrigin(location);
          model.bookingState.setPassengerOriginManualAddress('');
          model.bookingState.setShouldAutofillPassengerOrigin(false);
          model.wizard.restoreBookingModalAfterLocationPicker();
          model.bookingState.setBookingModalError('');
        }}
      />

      {/* Location Picker pour la destination */}
      <LocationPickerModal
        visible={model.bookingState.showDestinationPicker}
        title="Ma destination sur le trajet"
        initialLocation={model.bookingState.passengerDestination}
        routeCoordinates={model.bookingState.routeCoordinates || undefined}
        restrictToRoute={true}
        onClose={model.wizard.restoreBookingModalAfterLocationPicker}
        onSelect={(location) => {
          model.bookingState.setPassengerDestination(location);
          model.bookingState.setPassengerDestinationManualAddress('');
          model.wizard.restoreBookingModalAfterLocationPicker();
          model.bookingState.setBookingModalError('');
        }}
      />

      <TripBookingSuccessModal
        bookingSuccess={model.bookingState.bookingSuccess}
        insets={model.data.insets}
        closeBookingSuccessModal={model.wizard.closeBookingSuccessModal}
        handleViewBookings={model.wizard.handleViewBookings}
      />

      <TripReviewsModal
        reviewsModalVisible={model.bookingState.reviewsModalVisible}
        setReviewsModalVisible={model.bookingState.setReviewsModalVisible}
        insets={model.data.insets}
        trip={model.data.trip}
        driverReviewCount={model.activity.driverReviewCount}
        driverReviews={model.bookingState.driverReviews}
      />

      <TutorialOverlay
        visible={model.bookingState.tripGuideVisible}
        title="Découvrez ce trajet"
        message="Suivez la progression du conducteur, contactez-le ou réservez vos places depuis cet écran."
        onDismiss={model.activity.dismissTripGuide}
      />

      {/* Image Modal */}
      <TripImageModal
        imageModalVisible={model.bookingState.imageModalVisible}
        setImageModalVisible={model.bookingState.setImageModalVisible}
        selectedImageUri={model.bookingState.selectedImageUri}
      />

      {/* Contact Modal */}
      <TripContactModal
        contactModalVisible={model.bookingState.contactModalVisible}
        setContactModalVisible={model.bookingState.setContactModalVisible}
        insets={model.data.insets}
        trip={model.data.trip}
        driverPhone={model.data.driverPhone}
        showDialog={model.data.showDialog}
      />

      <TripEditModal
        editTripModalVisible={model.editing.edit.editTripModalVisible}
        closeEditModal={model.editing.editor.closeEditModal}
        editModalBottomPadding={model.editing.editLabels.editModalBottomPadding}
        trip={model.data.trip}
        editStep={model.editing.edit.editStep}
        swapEditRoutePoints={model.editing.editRoute.swapEditRoutePoints}
        editRouteMode={model.editing.edit.editRouteMode}
        setEditRouteMode={model.editing.edit.setEditRouteMode}
        editDepartureManualAddress={model.editing.edit.editDepartureManualAddress}
        setEditDepartureManualAddress={model.editing.edit.setEditDepartureManualAddress}
        editArrivalManualAddress={model.editing.edit.editArrivalManualAddress}
        setEditArrivalManualAddress={model.editing.edit.setEditArrivalManualAddress}
        handleContinueEditTrip={model.editing.editRoute.handleContinueEditTrip}
        openEditRoutePicker={model.editing.editRoute.openEditRoutePicker}
        editDepartureDisplay={model.editing.editLabels.editDepartureDisplay}
        editArrivalDisplay={model.editing.editLabels.editArrivalDisplay}
        editVehiclesLoading={model.editing.edit.editVehiclesLoading}
        activeEditVehicles={model.editing.edit.activeEditVehicles}
        editVehicleId={model.editing.edit.editVehicleId}
        setEditVehicleId={model.editing.edit.setEditVehicleId}
        openDateOrTimePicker={model.editing.editSchedule.openDateOrTimePicker}
        formattedEditDate={model.editing.editLabels.formattedEditDate}
        formattedEditTime={model.editing.editLabels.formattedEditTime}
        iosPickerMode={model.editing.edit.iosPickerMode}
        getEditBaseDate={model.editing.editSchedule.getEditBaseDate}
        handleIosPickerChange={model.editing.editSchedule.handleIosPickerChange}
        closeIosPicker={model.editing.editSchedule.closeIosPicker}
        editSeats={model.editing.edit.editSeats}
        setEditSeats={model.editing.edit.setEditSeats}
        editPrice={model.editing.edit.editPrice}
        setEditPrice={model.editing.edit.setEditPrice}
        editRequiresPassengerKyc={model.editing.edit.editRequiresPassengerKyc}
        setEditRequiresPassengerKyc={model.editing.edit.setEditRequiresPassengerKyc}
        handleBackToEditRoute={model.editing.editRoute.handleBackToEditRoute}
        isSavingTrip={model.editing.edit.isSavingTrip}
        handleSaveTrip={model.editing.editSubmission.handleSaveTrip}
      />

      <LocationPickerModal
        visible={model.editing.edit.editRoutePickerTarget !== null}
        title={model.editing.edit.editRoutePickerTarget === 'departure' ? 'Choisir le départ' : "Choisir l'arrivée"}
        initialLocation={
          model.editing.edit.editRoutePickerTarget === 'departure' ? model.editing.edit.editDepartureSelection : model.editing.edit.editArrivalSelection
        }
        autoLocateOnOpen={false}
        onClose={model.editing.editRoute.restoreEditModalAfterRoutePicker}
        onSelect={(location) => {
          const target = model.editing.edit.editRoutePickerTarget;
          model.editing.edit.setEditRouteMode('map');
          if (target === 'departure') {
            model.editing.edit.setEditDepartureSelection(location);
            model.editing.edit.setEditDepartureManualAddress(location.title || location.address);
            model.editing.editRoute.restoreEditModalAfterRoutePicker();
            return;
          }
          if (target === 'arrival') {
            model.editing.edit.setEditArrivalSelection(location);
            model.editing.edit.setEditArrivalManualAddress(location.title || location.address);
          }
          model.editing.editRoute.restoreEditModalAfterRoutePicker();
        }}
      />
    </SafeAreaView>
  );
}

