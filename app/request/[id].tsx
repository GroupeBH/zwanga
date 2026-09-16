import { useRequestDetailController } from '../../hooks/request-detail/useRequestDetailController';
import { buildRequestDetailPresentation } from '../../features/request-detail/requestPresentation';
import { RequestDriverSummary } from '../../features/request-detail/RequestDriverSummary';
import { RequestPassengerSummary } from '../../features/request-detail/RequestPassengerSummary';
import { RequestEditModal } from '../../features/request-detail/RequestEditModal';
import { RequestAcceptModal } from '../../features/request-detail/RequestAcceptModal';
import { styles } from '../../features/screen-styles/app/request/detail/index';
import LocationPickerModal from '@/components/LocationPickerModal';
import { Colors } from '@/constants/styles';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TripRequestDetailsScreen() {
  const model = useRequestDetailController();
  const passengerTripId = model.passengerTripId;

  if (model.isLoading || (model.isFetchingRequest && !model.tripRequest) || model.isOpeningAssignedTrip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={model.goHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          {model.isOpeningAssignedTrip && <Text style={styles.emptyText}>Ouverture de votre trajet…</Text>}
        </View>
      </SafeAreaView>
    );
  }

  if (model.isError || model.error) {
    const errorMessage = getApiErrorMessage(
      model.error,
      'Impossible de charger la demande pour le moment. Réessayez dans un instant.',
    );
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={model.goHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.danger} />
          <Text style={styles.emptyTitle}>Erreur</Text>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          {passengerTripId && (
            <TouchableOpacity style={styles.retryButton} onPress={() => model.handleViewTrip(passengerTripId)}>
              <Ionicons name="navigate-outline" size={20} color={Colors.white} />
              <Text style={styles.retryButtonText}>Voir mon trajet</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => model.refetch()}
          >
            <Ionicons name="refresh" size={20} color={Colors.white} />
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!model.tripRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={model.goHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Détails de la demande</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={64} color={Colors.gray[400]} />
          <Text style={styles.emptyTitle}>Demande introuvable</Text>
          <Text style={styles.emptyText}>
            La demande de trajet que vous recherchez n&apos;existe pas ou n&apos;est plus disponible.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const presentation = buildRequestDetailPresentation({
    tripRequest: model.tripRequest,
    routeCoordinates: model.routeCoordinates,
    canOpenAssignedTrip: model.canOpenAssignedTrip,
    canStartAssignedTrip: model.canStartAssignedTrip,
    canAcceptDirectly: model.canAcceptDirectly,
    myOffer: model.myOffer,
    isDriverAccount: model.isDriverAccount,
    isIdentityVerified: model.isIdentityVerified,
    compatibleActiveVehicles: model.compatibleActiveVehicles,
    requestedVehicleType: model.requestedVehicleType,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={model.goHome} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{model.isOwner ? 'Votre demande' : 'Demande de trajet'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, !model.isOwner && styles.driverContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={model.refreshing} onRefresh={model.onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* En-tête avec statut */}
        {model.isOwner ? (
          <RequestPassengerSummary
            statusConfig={presentation.statusConfig}
            pendingOffersCount={presentation.pendingOffersCount}
            tripRequest={model.tripRequest}
            ownerHero={presentation.ownerHero}
            requestRouteMapData={presentation.requestRouteMapData}
            displayedRouteCoordinates={presentation.displayedRouteCoordinates}
            requestedVehicleType={model.requestedVehicleType}
            ownerDisplayedBudget={presentation.ownerDisplayedBudget}
            heroStepIndex={presentation.heroStepIndex}
            heroSteps={presentation.heroSteps}
            handleViewTrip={model.handleViewTrip}
            ownerHeroHintMessage={presentation.ownerHeroHintMessage}
            canEdit={model.canEdit}
            canCancel={model.canCancel}
            handleOpenEditForm={model.handleOpenEditForm}
            isCancelling={model.isCancelling}
            handleCancelRequest={model.handleCancelRequest}
          />
        ) : (
          <RequestDriverSummary
            driverHero={presentation.driverHero}
            myOffer={model.myOffer}
            tripRequest={model.tripRequest}
            requestRouteMapData={presentation.requestRouteMapData}
            displayedRouteCoordinates={presentation.displayedRouteCoordinates}
            requestedVehicleType={model.requestedVehicleType}
            canOpenAssignedTrip={model.canOpenAssignedTrip}
            handleViewTrip={model.handleViewTrip}
            canStartAssignedTrip={model.canStartAssignedTrip}
            handleStartTripFromRequest={model.handleStartTripFromRequest}
            isStartingTripFromRequest={model.isStartingTripFromRequest}
            canAcceptDirectly={model.canAcceptDirectly}
            handleOpenDirectAcceptModal={model.handleOpenDirectAcceptModal}
            isAcceptingTripRequest={model.isAcceptingTripRequest}
            isStartingTrip={model.isStartingTrip}
            isDriverAccount={model.isDriverAccount}
            openDriverOnboarding={model.openDriverOnboarding}
            isIdentityVerified={model.isIdentityVerified}
            checkIdentity={model.checkIdentity}
            compatibleActiveVehicles={model.compatibleActiveVehicles}
          />
        )}

        {false && (
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations utiles</Text>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Ionicons name="radio-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Demande publiée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(presentation.request.createdAt, false)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Date de départ souhaitée</Text>
                <Text style={styles.detailValue}>
                  {formatDateWithRelativeLabel(presentation.request.departureDateMin, true)}
                </Text>
                <Text style={styles.detailSubValue}>
                  Délai max: {formatDateWithRelativeLabel(presentation.request.departureDateMax, true)}
                </Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={20} color={Colors.gray[600]} />
              <View style={styles.detailInfo}>
                <Text style={styles.detailLabel}>Nombre de places</Text>
                <Text style={styles.detailValue}>{presentation.request.numberOfSeats}</Text>
              </View>
            </View>
            {presentation.request.maxPricePerSeat && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="cash-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Prix maximum par place</Text>
                    <Text style={styles.detailValue}>{presentation.request.maxPricePerSeat} FC</Text>
                  </View>
                </View>
              </>
            )}
            {presentation.request.description && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{presentation.request.description}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
          </View>
        )}

        {model.tripRequest.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Note du passager</Text>
            <View style={styles.detailsCard}>
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={20} color={Colors.gray[600]} />
                <View style={styles.detailInfo}>
                  <Text style={styles.detailValue}>{model.tripRequest.description}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {model.tripRequest && (
          <RequestAcceptModal
            showDirectAcceptModal={model.showDirectAcceptModal}
            closeDirectAcceptModal={model.closeDirectAcceptModal}
            directAcceptDepartureDate={model.directAcceptDepartureDate}
            requestedVehicleType={model.requestedVehicleType}
            directAcceptRequiresPassengerKyc={model.directAcceptRequiresPassengerKyc}
            setDirectAcceptRequiresPassengerKyc={model.setDirectAcceptRequiresPassengerKyc}
            compatibleActiveVehicles={model.compatibleActiveVehicles}
            directAcceptVehicleId={model.directAcceptVehicleId}
            setDirectAcceptVehicleId={model.setDirectAcceptVehicleId}
            directAcceptVehicle={model.directAcceptVehicle}
            areDirectOptionsExpanded={model.areDirectOptionsExpanded}
            setAreDirectOptionsExpanded={model.setAreDirectOptionsExpanded}
            openDirectRouteOverridePicker={model.openDirectRouteOverridePicker}
            directAcceptDepartureLocation={model.directAcceptDepartureLocation}
            directAcceptDepartureReference={model.directAcceptDepartureReference}
            setDirectAcceptDepartureReference={model.setDirectAcceptDepartureReference}
            directAcceptArrivalLocation={model.directAcceptArrivalLocation}
            directAcceptArrivalReference={model.directAcceptArrivalReference}
            setDirectAcceptArrivalReference={model.setDirectAcceptArrivalReference}
            canAcceptRequest={model.canAcceptRequest}
            isAcceptingTripRequest={model.isAcceptingTripRequest}
            isStartingTrip={model.isStartingTrip}
            handleDirectAcceptTripRequest={model.handleDirectAcceptTripRequest}
          />
        )}

        {/* Modal de modification de la demande */}
        {model.showEditForm && model.tripRequest && (
            <RequestEditModal
              showEditForm={model.showEditForm}
              setShowEditForm={model.setShowEditForm}
              editAddressInputMode={model.editAddressInputMode}
              setEditAddressInputMode={model.setEditAddressInputMode}
              editDepartureManualAddress={model.editDepartureManualAddress}
              setEditDepartureManualAddress={model.setEditDepartureManualAddress}
              editArrivalManualAddress={model.editArrivalManualAddress}
              setEditArrivalManualAddress={model.setEditArrivalManualAddress}
              openEditLocationPicker={model.openEditLocationPicker}
              editDepartureAddress={model.editDepartureAddress}
              editArrivalAddress={model.editArrivalAddress}
              openEditDateOrTimePickerMin={model.openEditDateOrTimePickerMin}
              editDepartureDateMin={model.editDepartureDateMin}
              openEditDateOrTimePickerMax={model.openEditDateOrTimePickerMax}
              editDepartureDateMax={model.editDepartureDateMax}
              editScheduleError={model.editScheduleError}
              editIosPickerModeMin={model.editIosPickerModeMin}
              handleEditIosPickerChangeMin={model.handleEditIosPickerChangeMin}
              editIosPickerModeMax={model.editIosPickerModeMax}
              handleEditIosPickerChangeMax={model.handleEditIosPickerChangeMax}
              editVehiclePriceMultiplier={model.editVehiclePriceMultiplier}
              isEditVehicleOptionsLoading={model.isEditVehicleOptionsLoading}
              editVehicleOptions={model.editVehicleOptions}
              isEditVehicleOptionsError={model.isEditVehicleOptionsError}
              retryEditVehicleOptions={model.retryEditVehicleOptions}
              editVehicleType={model.editVehicleType}
              parsedEditNumberOfSeats={model.parsedEditNumberOfSeats}
              handleSelectEditVehicle={model.handleSelectEditVehicle}
              editNumberOfSeats={model.editNumberOfSeats}
              setEditNumberOfSeats={model.setEditNumberOfSeats}
              editMaxPricePerSeat={model.editMaxPricePerSeat}
              setEditMaxPricePerSeat={model.setEditMaxPricePerSeat}
              isEditBudgetValid={model.isEditBudgetValid}
              parsedEditBudget={model.parsedEditBudget}
              editSeatCapacity={model.editSeatCapacity}
              isIdentityVerified={model.isIdentityVerified}
              openEditIdentityVerification={model.openEditIdentityVerification}
              editDescription={model.editDescription}
              setEditDescription={model.setEditDescription}
              isEditFormValid={model.isEditFormValid}
              handleUpdateRequest={model.handleUpdateRequest}
              isUpdating={model.isUpdating}
            />
          )}
        {/* Location Picker Modal pour la modification */}
        {model.editLocationPickerType && (
          <LocationPickerModal
            visible={model.editActivePicker !== null}
            onClose={model.restoreEditFormAfterLocationPicker}
            onSelect={(location) => {
              if (model.editLocationPickerType === 'departure') {
                model.setEditDepartureLocation(location);
                model.setEditDepartureManualAddress(location.title || location.address);
              } else {
                model.setEditArrivalLocation(location);
                model.setEditArrivalManualAddress(location.title || location.address);
              }
              model.setEditAddressInputMode('map');
              model.restoreEditFormAfterLocationPicker();
            }}
            initialLocation={
              model.editLocationPickerType === 'departure' ? model.editDepartureLocation : model.editArrivalLocation
            }
          />
        )}

        <LocationPickerModal
          visible={model.routeOverridePickerTarget !== null}
          onClose={model.restoreDirectAcceptModalAfterLocationPicker}
          onSelect={model.handleRouteOverrideSelected}
          initialLocation={
            model.routeOverridePickerTarget === 'directDeparture'
              ? model.directAcceptDepartureLocation
              : model.routeOverridePickerTarget === 'directArrival'
                ? model.directAcceptArrivalLocation
                : null
          }
          title={
            model.routeOverridePickerTarget === 'directArrival'
              ? 'Point d’arrivée'
              : 'Point de départ'
          }
        />

      </ScrollView>
    </SafeAreaView>
  );
}

