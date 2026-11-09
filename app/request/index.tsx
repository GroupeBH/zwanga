import LocationPickerModal from '@/components/LocationPickerModal';
import { FormScreen } from '@/components/forms/FormLayout';
import { RequestBudgetFields } from '@/components/trip-request/RequestBudgetFields';
import { RequestDriverPicker } from '@/components/trip-request/RequestDriverPicker';
import { DirectDriverNotice } from '@/components/trip-request/DirectDriverNotice';
import { Colors } from '@/constants/styles';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import Animated, { FadeIn } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { RequestDatePickerModal } from '@/components/trip-request/RequestDatePickerModal';
import { RequestPrimaryButton } from '@/components/trip-request/RequestPrimaryButton';
import { RequestRoutePreview } from '@/components/trip-request/RequestRoutePreview';
import { RequestRouteStep } from '@/components/trip-request/RequestRouteStep';
import { RequestScheduleFields } from '@/components/trip-request/RequestScheduleFields';
import { RequestSuccessModal } from '@/components/trip-request/RequestSuccessModal';
import { useRequestTripController } from '@/hooks/trip-request/useRequestTripController';
import { useRequestFormNavigation } from '@/hooks/trip-request/useRequestFormNavigation';
import { HomeRequestScreen } from '@/components/trip-request/HomeRequestScreen';

export default function RequestTripScreen() {
  const form = useRequestTripController();
  const navigation = useRequestFormNavigation(form);
  if (form.isHomeEntry) return <HomeRequestScreen form={form} navigation={navigation} />;
  return (
    <FormScreen style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={navigation.handleBack}
          style={[styles.headerButton, navigation.backDisabled && styles.mainButtonDisabled]}
          disabled={navigation.backDisabled} accessibilityState={{ disabled: navigation.backDisabled }}
          accessibilityRole="button" accessibilityLabel={form.requestFormStep === 'details'
            ? 'Revenir à la première étape : départ et arrivée' : 'Retour'}>
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Commander un trajet</Text>
        <View style={styles.headerSpacer} />
      </View>
      <Text style={styles.stepCaption} accessibilityLiveRegion="polite">
        {form.requestFormStep === 'route' ? '1 sur 2 · Départ et arrivée' : '2 sur 2 · Heure et prix'}
      </Text>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          ref={navigation.scrollRef}
          contentContainerStyle={[
            styles.content,
            form.requestFormStep === 'route' ? styles.routeContent : styles.detailsContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <DirectDriverNotice prefill={form.directDriverPrefill} driver={form.targetDriver} disabled={form.isCreating} />
          {form.requestFormStep === 'route' && (
            <RequestRouteStep
              addressInputMode={form.addressInputMode}
              addressSectionStep={form.addressSectionStep}
              applyQuickPlaceToNextSlot={form.applyQuickPlaceToNextSlot}
              applySelectionToNextSlot={form.applySelectionToNextSlot}
              arrivalAddress={form.arrivalAddress}
              arrivalManualAddress={form.arrivalManualAddress}
              arrivalManualGeocodeStatus={form.arrivalManualGeocodeStatus}
              arrivalReference={form.arrivalReference}
              departureAddress={form.departureAddress}
              departureManualAddress={form.departureManualAddress}
              departureManualGeocodeStatus={form.departureManualGeocodeStatus}
              departureReference={form.departureReference}
              departureTouchedRef={form.departureTouchedRef}
              favoriteSuggestions={form.favoriteSuggestions}
              hasArrivalAddress={form.hasArrivalAddress}
              hasDepartureAddress={form.hasDepartureAddress}
              openPickerFor={form.openPickerFor}
              quickPlaceResolvingKey={form.quickPlaceResolvingKey}
              selectedVehicleTypes={form.selectedVehicleTypes}
              setArrivalLocation={form.setArrivalLocation}
              setArrivalManualAddress={form.setArrivalManualAddress}
              setArrivalReference={form.setArrivalReference}
              setDepartureLocation={form.setDepartureLocation}
              setDepartureManualAddress={form.setDepartureManualAddress}
              setDepartureReference={form.setDepartureReference}
              setSelectedVehicleTypes={form.setSelectedVehicleTypes}
              numberOfSeats={form.numberOfSeats}
              setShowQuickLandmarks={form.setShowQuickLandmarks}
              showQuickLandmarks={form.showQuickLandmarks}
              swapRoutePoints={form.swapRoutePoints}
            />
          )}

          {form.requestFormStep === 'details' && !form.createdRequestId && !form.submissionRecoveryMessage && (
            <Animated.View entering={FadeIn} style={styles.offerFlow}>
              <RequestRoutePreview
                arrivalAddress={form.arrivalAddress}
                arrivalLocation={form.arrivalLocation}
                arrivalReference={form.arrivalReference}
                departureAddress={form.departureAddress}
                departureLocation={form.departureLocation}
                departureReference={form.departureReference}
                isRouteLoading={form.isRouteLoading}
                routeCoordinates={form.routeCoordinates}
                routeDistanceLabel={form.routeDistanceLabel}
                routePreviewRegion={form.routePreviewRegion}
                onEditRoute={navigation.returnToRoute}
                editDisabled={navigation.backDisabled}
              />

              <View style={styles.offerSheet}>
                <RequestScheduleFields
                  departureDateMin={form.departureDateMin}
                  hasChosenDepartureTime={form.hasChosenDepartureTime}
                  pickerError={form.pickerError}
                  flexibilityMinutes={form.flexibilityMinutes}
                  openCustomPicker={form.openCustomPicker}
                  setFlexibilityMinutes={form.setFlexibilityMinutes}
                  timePreset={form.timePreset}
                  timeSummary={form.timeSummary}
                />

                <RequestBudgetFields
                  isPriceLoading={form.isPriceLoading}
                  vehicleOptions={form.vehicleOptions}
                  isVehicleOptionsError={form.isVehicleOptionsError}
                  retryVehicleOptions={form.retryVehicleOptions}
                  budgetValue={form.budgetValue}
                  updateBudget={form.updateBudget}
                  budgetLabel={form.budgetLabel}
                  budgetHintLabel={form.budgetHintLabel}
                  totalBudgetLabel={form.totalBudgetLabel}
                  requestSeatsLabel={form.requestSeatsLabel}
                  hasSpecifiedNumberOfSeats={form.hasSpecifiedNumberOfSeats}
                  numberOfSeats={form.numberOfSeats}
                  selectedVehicleTypes={form.selectedVehicleTypes}
                  setHasSpecifiedNumberOfSeats={form.setHasSpecifiedNumberOfSeats}
                  setNumberOfSeats={form.setNumberOfSeats}
                  requestPaymentMode={form.requestPaymentMode}
                  setRequestPaymentMode={form.setRequestPaymentMode}
                  setShowAdvanced={form.setShowAdvanced}
                  showAdvanced={form.showAdvanced}
                  description={form.description}
                  setDescription={form.setDescription}
                />
                <RequestDriverPicker departure={form.departureLocation} vehicleType={form.selectedVehicleType}
                  vehicleTypes={form.selectedVehicleTypes}
                  seats={form.hasSpecifiedNumberOfSeats ? form.numberOfSeats : 1} selected={form.targetDriver}
                  onSelect={form.setTargetDriver} disabled={form.isCreating} />
              </View>
            </Animated.View>
          )}
        </ScrollView>

      {form.requestFormStep === 'route' && (
        <View style={styles.footer}>
          <RequestPrimaryButton
            handlePrimaryAction={form.handlePrimaryAction}
            primaryButtonDisabled={form.primaryButtonDisabled}
            primaryIconName={form.primaryIconName}
            primaryLabel={form.primaryLabel}
          />
        </View>
      )}

      {form.requestFormStep === 'details' && !form.isRequestSuccessVisible && (
        <View style={styles.offerStickyFooter}>
          <TouchableOpacity onPress={navigation.returnToRoute}
            style={[styles.previousStepButton, navigation.backDisabled && styles.mainButtonDisabled]}
            disabled={navigation.backDisabled} accessibilityRole="button"
            accessibilityLabel="Étape précédente : départ et arrivée"
            accessibilityState={{ disabled: navigation.backDisabled }}>
            <Ionicons name="chevron-back" size={18} color={Colors.gray[700]} />
            <Text style={styles.previousStepText}>Étape précédente</Text>
          </TouchableOpacity>
          {form.submissionError ? (
            <View style={styles.submissionErrorBanner}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.submissionErrorText}>{form.submissionError}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.offerSubmitButton, form.primaryButtonDisabled && styles.mainButtonDisabled]}
            onPress={form.handlePrimaryAction}
            disabled={form.primaryButtonDisabled}
            activeOpacity={0.9}
          >
            {form.isCreating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.offerSubmitText}>{form.primaryLabel}</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
      </KeyboardAvoidingView>

      <RequestSuccessModal
        createdRequestId={form.createdRequestId}
        goHomeAfterRequestSuccess={form.goHomeAfterRequestSuccess}
        goToRequestSuccessDetail={form.goToRequestSuccessDetail}
        insets={form.insets}
        isRequestSuccessVisible={form.isRequestSuccessVisible}
        isResolvingSentRequest={form.isResolvingSentRequest}
        requestSuccessDetailLabel={form.requestSuccessDetailLabel}
        requestSuccessText={form.requestSuccessText}
      />

      <LocationPickerModal
        visible={form.activePicker !== null}
        title={form.activePicker === 'departure' ? 'Choisir le départ' : 'Choisir la destination'}
        initialLocation={form.activePicker === 'departure' ? form.departureLocation : form.arrivalLocation}
        autoLocateOnOpen={false}
        onClose={() => form.setActivePicker(null)}
        onSelect={(location) => {
          const target = form.activePicker;
          form.setActivePicker(null);
          if (target === 'departure') {
            form.departureTouchedRef.current = true;
            form.setAddressInputMode('map');
            form.setDepartureLocation(location);
            form.setDepartureManualAddress(location.title || location.address);
            form.setAddressSectionStep('arrival');
            return;
          }
          form.setAddressInputMode('map');
          form.setArrivalLocation(location);
          form.setArrivalManualAddress(location.title || location.address);
        }}
      />

      <RequestDatePickerModal
        iosPickerValue={form.iosPickerValue}
        handleIosPickerChange={form.handleIosPickerChange}
        insets={form.insets}
        iosPickerMode={form.iosPickerMode}
        closeDatePicker={form.closeDatePicker}
        confirmIosPicker={form.confirmIosPicker}
      />
    </FormScreen>
  );
}
