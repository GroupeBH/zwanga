import LocationPickerModal from '@/components/LocationPickerModal';
import { RequestBudgetFields } from '@/components/trip-request/RequestBudgetFields';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { RequestDatePickerModal } from '@/components/trip-request/RequestDatePickerModal';
import { RequestPrimaryButton } from '@/components/trip-request/RequestPrimaryButton';
import { RequestRoutePreview } from '@/components/trip-request/RequestRoutePreview';
import { RequestRouteStep } from '@/components/trip-request/RequestRouteStep';
import { RequestScheduleFields } from '@/components/trip-request/RequestScheduleFields';
import { RequestSuccessModal } from '@/components/trip-request/RequestSuccessModal';
import { useRequestTripController } from '@/hooks/trip-request/useRequestTripController';

export default function RequestTripScreen() {
  const form = useRequestTripController();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => form.router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Demander un trajet</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            form.requestFormStep === 'route' ? styles.routeContent : styles.detailsContent,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {form.requestFormStep === 'route' && (
            <RequestRouteStep
              addressInputMode={form.addressInputMode}
              addressSectionStep={form.addressSectionStep}
              applyQuickPlaceToNextSlot={form.applyQuickPlaceToNextSlot}
              applySelectionToNextSlot={form.applySelectionToNextSlot}
              arrivalAddress={form.arrivalAddress}
              arrivalManualAddress={form.arrivalManualAddress}
              arrivalManualGeocodeStatus={form.arrivalManualGeocodeStatus}
              departureAddress={form.departureAddress}
              departureManualAddress={form.departureManualAddress}
              departureManualGeocodeStatus={form.departureManualGeocodeStatus}
              departureTouchedRef={form.departureTouchedRef}
              favoriteSuggestions={form.favoriteSuggestions}
              hasArrivalAddress={form.hasArrivalAddress}
              hasDepartureAddress={form.hasDepartureAddress}
              openPickerFor={form.openPickerFor}
              quickPlaceResolvingKey={form.quickPlaceResolvingKey}
              selectedVehicleType={form.selectedVehicleType}
              setArrivalLocation={form.setArrivalLocation}
              setArrivalManualAddress={form.setArrivalManualAddress}
              setDepartureLocation={form.setDepartureLocation}
              setDepartureManualAddress={form.setDepartureManualAddress}
              setSelectedVehicleType={form.setSelectedVehicleType}
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
                departureAddress={form.departureAddress}
                departureLocation={form.departureLocation}
                isRouteLoading={form.isRouteLoading}
                routeCoordinates={form.routeCoordinates}
                routeDistanceLabel={form.routeDistanceLabel}
                routePreviewRegion={form.routePreviewRegion}
                setRequestFormStep={form.setRequestFormStep}
              />

              <View style={styles.offerSheet}>
                <RequestScheduleFields
                  applyPreset={form.applyPreset}
                  departureDateMin={form.departureDateMin}
                  departureTimeRangeLabel={form.departureTimeRangeLabel}
                  flexibilityMinutes={form.flexibilityMinutes}
                  openCustomPicker={form.openCustomPicker}
                  selectedTimePreset={form.selectedTimePreset}
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
                  selectedVehicleType={form.selectedVehicleType}
                  setHasSpecifiedNumberOfSeats={form.setHasSpecifiedNumberOfSeats}
                  setNumberOfSeats={form.setNumberOfSeats}
                  requestPaymentMode={form.requestPaymentMode}
                  setRequestPaymentMode={form.setRequestPaymentMode}
                  setShowAdvanced={form.setShowAdvanced}
                  showAdvanced={form.showAdvanced}
                  description={form.description}
                  setDescription={form.setDescription}
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {form.requestFormStep === 'route' && (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <RequestPrimaryButton
            handlePrimaryAction={form.handlePrimaryAction}
            primaryButtonDisabled={form.primaryButtonDisabled}
            primaryIconName={form.primaryIconName}
            primaryLabel={form.primaryLabel}
          />
        </SafeAreaView>
      )}

      {form.requestFormStep === 'details' && !form.isRequestSuccessVisible && (
        <SafeAreaView edges={['bottom']} style={styles.offerStickyFooter}>
          {form.submissionError ? (
            <View style={styles.submissionErrorBanner}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={styles.submissionErrorText}>{form.submissionError}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.offerSubmitButton, form.primaryButtonDisabled && styles.mainButtonDisabled]}
            onPress={form.handleCreateRequest}
            disabled={form.primaryButtonDisabled}
            activeOpacity={0.9}
          >
            {form.isCreating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Text style={styles.offerSubmitText}>Chercher un chauffeur</Text>
                <Ionicons name="arrow-forward" size={20} color={Colors.white} />
              </>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      )}

      <RequestSuccessModal
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
        departureDateMin={form.departureDateMin}
        handleIosPickerChange={form.handleIosPickerChange}
        insets={form.insets}
        iosPickerMode={form.iosPickerMode}
        setIosPickerMode={form.setIosPickerMode}
      />
    </SafeAreaView>
  );
}
