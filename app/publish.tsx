import { PublishSuccessOverlay } from '../features/publish/PublishSuccessOverlay';
import { PublishDriverRequiredModal } from '../features/publish/PublishDriverRequiredModal';
import { usePublishController } from '../hooks/publish/usePublishController';
import { PublishStepIndicator } from '../features/publish/PublishStepIndicator';
import { PublishRouteStep } from '../features/publish/PublishRouteStep';
import { PublishDateTimeModal } from '../features/publish/PublishDateTimeModal';
import { PublishIdentityModal } from '../features/publish/PublishIdentityModal';
import { PublishScheduleStep } from '../features/publish/PublishScheduleStep';
import { PublishVehicleStep } from '../features/publish/PublishVehicleStep';
import { PublishPricingStep } from '../features/publish/PublishPricingStep';
import { PublishConfirmationStep } from '../features/publish/PublishConfirmationStep';
import { styles } from '../features/screen-styles/app/publish/index';
import { FormScreen } from '@/components/forms/FormLayout';
import LocationPickerModal from '@/components/LocationPickerModal';
import { VehicleFormModal } from '@/components/VehicleFormModal';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export default function PublishScreen() {
  const model = usePublishController();
  const previousStep = model.previousStep;

  return (
    <FormScreen style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => model.router.back()} style={styles.closeButton}
          accessibilityRole="button" accessibilityLabel="Fermer la publication">
          <Ionicons name="close" size={28} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Proposer un trajet</Text>
        </View>
      </View>

      {/* Step Indicator */}
      <PublishStepIndicator
        isStepActive={model.navigation.isStepActive}
        isStepCompleted={model.navigation.isStepCompleted}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          testID="publish-step-content"
          key={model.step}
          keyboardDismissMode="on-drag"
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollViewContent,
            model.step === 'route' && styles.routeScrollViewContent,
            { paddingBottom: 12 },
          ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Étape 1: Itinéraire */}
        {model.step === 'route' && (
          <PublishRouteStep
            stepEntering={model.stepEntering}
            hasDepartureCoordinates={model.route.hasDepartureCoordinates}
            setManualAddressTarget={model.form.setManualAddressTarget}
            openLocationPicker={model.locationActions.openLocationPicker}
            hasDepartureAddress={model.route.hasDepartureAddress}
            departureLocation={model.form.departureLocation}
            departureManualAddress={model.form.departureManualAddress}
            manualAddressTarget={model.form.manualAddressTarget}
            departureTouchedRef={model.departureTouchedRef}
            setDepartureManualAddress={model.form.setDepartureManualAddress}
            setDepartureLocation={model.form.setDepartureLocation}
            setDeparturePointStatus={model.form.setDeparturePointStatus}
            departureManualGeocodeStatus={model.routeResolution.departureManualGeocodeStatus}
            renderGpsStatus={model.presentation.renderGpsStatus}
            hasDepartureGpsSuggestion={model.route.hasDepartureGpsSuggestion}
            shouldShowDepartureReference={model.route.shouldShowDepartureReference}
            departureReference={model.form.departureReference}
            setShowDepartureReference={model.form.setShowDepartureReference}
            setDepartureReference={model.form.setDepartureReference}
            swapRoutePoints={model.locationActions.swapRoutePoints}
            hasArrivalCoordinates={model.route.hasArrivalCoordinates}
            hasArrivalAddress={model.route.hasArrivalAddress}
            arrivalLocation={model.form.arrivalLocation}
            arrivalManualAddress={model.form.arrivalManualAddress}
            setArrivalManualAddress={model.form.setArrivalManualAddress}
            setArrivalLocation={model.form.setArrivalLocation}
            setArrivalPointStatus={model.form.setArrivalPointStatus}
            arrivalManualGeocodeStatus={model.routeResolution.arrivalManualGeocodeStatus}
            hasArrivalGpsSuggestion={model.route.hasArrivalGpsSuggestion}
            shouldShowArrivalReference={model.route.shouldShowArrivalReference}
            arrivalReference={model.form.arrivalReference}
            setShowArrivalReference={model.form.setShowArrivalReference}
            setArrivalReference={model.form.setArrivalReference}
            showQuickLandmarks={model.form.showQuickLandmarks}
            setShowQuickLandmarks={model.form.setShowQuickLandmarks}
            isPublishIdentityVerified={model.identity.isPublishIdentityVerified}
            isCheckingIdentity={model.identity.isCheckingIdentity}
            isIdentityStatusUnavailable={!model.identity.isIdentityStatusKnown || model.identity.hasIdentityReadError}
            refreshIdentity={model.identity.refreshIdentity}
            handleStartKyc={model.handleStartKyc}
          />
        )}
        {/* Date et heure : même étape que l’itinéraire */}
        {model.step === 'route' && (
          <PublishScheduleStep
            stepEntering={model.stepEntering}
            openDateOrTimePicker={model.scheduleActions.openDateOrTimePicker}
            selectDepartureIn={model.scheduleActions.selectDepartureIn}
            formattedDateLabel={model.schedule.formattedDateLabel}
            formattedTimeLabel={model.schedule.formattedTimeLabel}
            hasChosenDepartureTime={model.form.hasChosenDepartureTime}
            pickerError={model.scheduleActions.pickerError}
            departureDateTime={model.form.departureDateTime}
            isRecurringTrip={model.form.isRecurringTrip}
            recurringWeekdayOptions={model.presentation.recurringWeekdayOptions}
            recurringWeekdays={model.form.recurringWeekdays}
            recurringEndDate={model.form.recurringEndDate}
            onSaveRecurrence={choice => {
              model.form.setIsRecurringTrip(choice !== null);
              if (choice) model.form.setRecurringWeekdays(choice.weekdays);
              model.form.setRecurringEndDate(choice?.endDate ?? null);
            }}
          />
        )}

        {/* Étape 2 : véhicule, places et prix */}
        {model.step === 'pricing' && <PublishConfirmationStep compact
          {...model.form} {...model.schedule} {...model.presentation}
          stepEntering={model.stepEntering} publicationSuccess={model.publicationSuccess}
          routePreviewRegion={model.route.routePreviewRegion}
          goToStep={model.navigation.goToStep} />}
        {model.step === 'pricing' && (
          <PublishVehicleStep
            stepEntering={model.stepEntering}
            activeVehicles={model.vehicle.activeVehicles}
            selectedVehicleId={model.vehicle.selectedVehicleId}
            vehicleCreationMessage={model.vehicle.vehicleCreationMessage}
            isLoadingVehicles={model.vehicle.isLoadingVehicles}
            openVehicleForm={model.vehicleEditor.openVehicleForm}
            setSelectedVehicleId={model.vehicle.setSelectedVehicleId}
          />
        )}

        {/* Places et prix : même étape que le véhicule */}
        {model.step === 'pricing' && (
          <PublishPricingStep
            estimate={model.pricing}
            acceptedPaymentModes={model.form.acceptedPaymentModes}
            setAcceptedPaymentModes={model.form.setAcceptedPaymentModes}
            stepEntering={model.stepEntering}
            setSeats={model.form.setSeats}
            seats={model.form.seats}
            vehicleType={model.selectedVehicleType}
            isFreeTrip={model.form.isFreeTrip}
            price={model.form.price}
            setPrice={model.form.setPrice}
            setIsFreeTrip={model.form.setIsFreeTrip}
            requiresPassengerKyc={model.form.requiresPassengerKyc}
            setRequiresPassengerKyc={model.form.setRequiresPassengerKyc}
            description={model.form.description}
            setDescription={model.form.setDescription}
          />
        )}

      </ScrollView>

        <View
          testID="publish-footer"
          style={[
            styles.fixedBottomBar,
            model.step !== 'route' && styles.fixedBottomBarRow,
            { paddingBottom: 12 },
          ]}
        >
          {previousStep && (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary, styles.fixedFooterBackButton]}
              onPress={() => model.navigation.goToStep(previousStep)}
              disabled={model.schedule.isSubmittingTrip}
            >
              <Text style={styles.buttonSecondaryText}>Retour</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.button,
              styles.fixedButton,
              model.step !== 'route' && styles.fixedFooterPrimaryButton,
              model.footerPrimaryDisabled && styles.buttonDisabled,
            ]}
            onPress={model.handleFooterPrimary}
            disabled={model.footerPrimaryDisabled}
          >
            {model.step === 'pricing' && model.schedule.isSubmittingTrip ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.buttonText}>{model.footerPrimaryLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <LocationPickerModal
        visible={model.form.activeLocationType !== null}
        title={
          model.form.activeLocationType === 'departure'
            ? 'Sélectionner le point de départ'
            : 'Sélectionner la destination'
        }
        initialLocation={
          model.form.activeLocationType === 'departure'
            ? model.form.departureLocation
            : model.form.activeLocationType === 'arrival'
              ? model.form.arrivalLocation
              : null
        }
        initialSearchQuery={model.form.locationPickerInitialQuery}
        onClose={model.locationActions.closeLocationPicker}
        onSelect={model.locationActions.handleLocationSelected}
      />

      {model.publicationSuccess !== null && (
        <PublishSuccessOverlay
          model={model}
        />
      )}

      <PublishDateTimeModal
        iosPickerMode={model.form.iosPickerMode}
        closeIosPicker={model.scheduleActions.closeIosPicker}
        iosPickerTarget={model.form.iosPickerTarget}
        iosPickerValue={model.form.iosPickerValue}
        departureDateTime={model.form.departureDateTime}
        handleIosPickerChange={model.scheduleActions.handleIosPickerChange}
        confirmIosPicker={model.scheduleActions.confirmIosPicker}
      />

      {/* Driver Required Modal */}
      <PublishDriverRequiredModal
        model={model}
      />

      <PublishIdentityModal
        kycModalVisible={model.identity.kycModalVisible}
        closeKycModal={model.identity.closeKycModal}
        kycChecklist={model.identity.kycChecklist}
        insets={model.insets}
        isKycBusy={model.identity.isKycBusy}
        handleStartKyc={model.handleStartKyc}
      />

      {/* Vehicle Creation Modal */}
      <VehicleFormModal
        visible={model.vehicle.showVehicleForm}
        {...model.vehicleEditor.vehicleModalCopy}
        vehicleType={model.vehicle.vehicleType}
        brand={model.vehicle.vehicleBrand}
        model={model.vehicle.vehicleModel}
        color={model.vehicle.vehicleColor}
        licensePlate={model.vehicle.vehicleLicensePlate}
        onVehicleTypeChange={(value) => {
          model.vehicle.setVehicleType(value);
          model.vehicle.setVehicleFormError(null);
        }}
        onBrandChange={(value) => {
          model.vehicle.setVehicleBrand(value);
          model.vehicle.setVehicleFormError(null);
        }}
        onModelChange={(value) => {
          model.vehicle.setVehicleModel(value);
          model.vehicle.setVehicleFormError(null);
        }}
        onColorChange={(value) => {
          model.vehicle.setVehicleColor(value);
          model.vehicle.setVehicleFormError(null);
        }}
        onLicensePlateChange={(value) => {
          model.vehicle.setVehicleLicensePlate(value);
          model.vehicle.setVehicleFormError(null);
        }}
        onClose={model.vehicleEditor.closeVehicleForm}
        onSubmit={model.vehicleCreation.handleCreateVehicle}
        submitting={model.vehicle.isCreatingVehicle || model.vehicle.isFinalizingVehicleCreation}
        errorMessage={model.vehicle.vehicleFormError}
      />
    </FormScreen>
  );
}
