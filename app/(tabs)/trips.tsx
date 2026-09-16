import { useTripsController } from '../../hooks/trips/useTripsController';
import { TripsEditModal } from '../../features/trips/TripsEditModal';
import { styles } from '../../features/screen-styles/app/tabs/trips/index';
import LocationPickerModal from '@/components/LocationPickerModal';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TripsScreen() {
  const model = useTripsController();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>Mes trajets</Text>
          <TouchableOpacity
            style={styles.headerPublishButton}
            onPress={() => model.state.router.push('/publish')}
            accessibilityLabel="Publier un trajet"
          >
            <Ionicons name="add" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Main Tabs */}
        <View style={styles.mainTabsContainer}>
          <TouchableOpacity
            style={[styles.mainTab, model.state.mainTab === 'published' && styles.mainTabActive]}
            onPress={() => {
              model.state.setMainTab('published');
              model.state.setSubTab('upcoming');
            }}
          >
            <Text
              numberOfLines={1}
              style={[styles.mainTabText, model.state.mainTab === 'published' && styles.mainTabTextActive]}
            >
              Publiés {model.list.trips.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, model.state.mainTab === 'bookings' && styles.mainTabActive]}
            onPress={() => {
              model.state.setMainTab('bookings');
              model.state.setSubTab('upcoming');
            }}
          >
            <Text
              numberOfLines={1}
              style={[styles.mainTabText, model.state.mainTab === 'bookings' && styles.mainTabTextActive]}
            >
              Réservations {model.state.myBookings?.length ?? 0}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub Tabs */}
        <View style={styles.subTabsContainer}>
          <TouchableOpacity
            style={[styles.subTab, model.state.subTab === 'upcoming' && styles.subTabActive]}
            onPress={() => model.state.setSubTab('upcoming')}
          >
            <Text
              numberOfLines={1}
              style={[styles.subTabText, model.state.subTab === 'upcoming' && styles.subTabTextActive]}
            >
              À venir {model.state.mainTab === 'published' ? model.list.upcomingTrips.length : model.list.upcomingBookings.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTab, model.state.subTab === 'completed' && styles.subTabActive]}
            onPress={() => model.state.setSubTab('completed')}
          >
            <Text
              numberOfLines={1}
              style={[styles.subTabText, model.state.subTab === 'completed' && styles.subTabTextActive]}
            >
              Terminés {model.state.mainTab === 'published' ? model.list.completedTrips.length : model.list.completedBookingsList.length}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={Colors.gray[500]} />
          <TextInput
            value={model.state.searchQuery}
            onChangeText={model.state.setSearchQuery}
            placeholder="Rechercher..."
            placeholderTextColor={Colors.gray[400]}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {model.state.searchQuery.length > 0 && Platform.OS !== 'ios' ? (
            <TouchableOpacity style={styles.searchClearButton} onPress={() => model.state.setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {model.list.isError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={16} color={Colors.white} />
          <Text style={styles.errorText}>
            Impossible de charger les {model.state.mainTab === 'published' ? 'trajets' : 'réservations'}. Réessayez.
          </Text>
          <TouchableOpacity onPress={model.state.mainTab === 'published' ? model.state.refetchTrips : model.state.refetchBookings}>
            <Text style={styles.errorAction}>Rafraîchir</Text>
          </TouchableOpacity>
        </View>
      )}

      {model.state.feedback && (
        <TouchableOpacity
          style={[
            styles.feedbackBanner,
            model.state.feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
          onPress={() => model.state.setFeedback(null)}
        >
          <Ionicons
            name={model.state.feedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={Colors.white}
          />
          <Text style={styles.feedbackText}>{model.state.feedback.message}</Text>
          <Ionicons name="close" size={16} color={Colors.white} />
        </TouchableOpacity>
      )}

      <FlatList
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={model.list.showLoader ? [] : model.list.tripListData}
        renderItem={model.renderTripListItem}
        keyExtractor={(item) =>
          item.kind === 'published'
            ? `trip-${item.trip.id}`
            : `booking-${item.booking.id}`
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={model.state.isRefreshing || model.list.isFetching}
            onRefresh={model.list.handleRefresh}
            tintColor={Colors.primary}
          />
        }
        ListHeaderComponent={
          model.state.mainTab === 'published' ? (
            <TouchableOpacity
              style={styles.recurringHubCard}
              onPress={() => model.state.router.push('/recurring-trips')}
            >
              <View style={styles.recurringHubIcon}>
                <Ionicons name="repeat" size={20} color={Colors.white} />
              </View>
              <View style={styles.recurringHubContent}>
                <Text style={styles.recurringHubTitle}>Trajets réguliers</Text>
                <Text style={styles.recurringHubText}>
                  {model.state.recurringTemplates.length > 0
                    ? `${model.list.activeRecurringTemplates} actif(s), ${model.state.recurringTemplates.length} trajet(s) enregistré(s)`
                    : 'Publier automatiquement vos trajets habituels'}
                </Text>
              </View>
              <View style={styles.recurringHubAction}>
                <Text style={styles.recurringHubActionText}>Gérer</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </View>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          model.list.showLoader ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loaderText}>
                Chargement des {model.state.mainTab === 'published' ? 'trajets' : 'réservations'}...
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={
                    model.list.normalizedSearchQuery
                      ? 'search-outline'
                      : model.state.mainTab === 'published'
                        ? 'car-outline'
                        : 'calendar-outline'
                  }
                  size={48}
                  color={Colors.gray[500]}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {model.list.normalizedSearchQuery
                  ? 'Aucun résultat'
                  : model.state.mainTab === 'published'
                    ? 'Aucun trajet'
                    : 'Aucune réservation'}
              </Text>
              <Text style={styles.emptyText}>
                {model.list.normalizedSearchQuery
                  ? `Aucun trajet ne correspond à « ${model.state.searchQuery.trim()} ».`
                  : model.state.mainTab === 'published'
                    ? model.state.subTab === 'upcoming'
                      ? "Vous n'avez pas de trajet à venir"
                      : "Vous n'avez pas encore terminé de trajet"
                    : model.state.subTab === 'upcoming'
                      ? "Vous n'avez pas de réservation à venir"
                      : "Vous n'avez pas encore terminé de réservation"}
              </Text>
              {model.list.normalizedSearchQuery ? (
                <TouchableOpacity
                  style={styles.emptySecondaryButton}
                  onPress={() => model.state.setSearchQuery('')}
                >
                  <Text style={styles.emptySecondaryButtonText}>Effacer la recherche</Text>
                </TouchableOpacity>
              ) : model.state.mainTab === 'published' && model.state.subTab === 'upcoming' ? (
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => model.state.router.push('/publish')}
                >
                  <Text style={styles.emptyButtonText}>Publier un trajet</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }
      />

      {/* FAB - Publier un trajet (seulement pour les trajets publiés) */}
      {model.state.mainTab === 'published' && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => model.state.router.push('/publish')}
        >
          <Ionicons name="add" size={32} color={Colors.white} />
        </TouchableOpacity>
      )}

      <TripsEditModal
        editingTrip={model.state.editingTrip}
        editModalSuspended={model.state.editModalSuspended}
        closeEditModal={model.editor.closeEditModal}
        editModalBottomPadding={model.editModalBottomPadding}
        editStep={model.state.editStep}
        swapEditRoutePoints={model.editor.swapEditRoutePoints}
        editRouteMode={model.state.editRouteMode}
        setEditRouteMode={model.state.setEditRouteMode}
        editDepartureManualAddress={model.state.editDepartureManualAddress}
        setEditDepartureManualAddress={model.state.setEditDepartureManualAddress}
        editArrivalManualAddress={model.state.editArrivalManualAddress}
        setEditArrivalManualAddress={model.state.setEditArrivalManualAddress}
        handleContinueEditTrip={model.editor.handleContinueEditTrip}
        openEditRoutePicker={model.editor.openEditRoutePicker}
        editDepartureDisplay={model.editDepartureDisplay}
        editArrivalDisplay={model.editArrivalDisplay}
        vehiclesLoading={model.state.vehiclesLoading}
        activeUserVehicles={model.state.activeUserVehicles}
        editVehicleId={model.state.editVehicleId}
        setEditVehicleId={model.state.setEditVehicleId}
        editSeats={model.state.editSeats}
        setEditSeats={model.state.setEditSeats}
        editPrice={model.state.editPrice}
        setEditPrice={model.state.setEditPrice}
        openDateOrTimePicker={model.schedule.openDateOrTimePicker}
        formattedEditDate={model.formattedEditDate}
        formattedEditTime={model.formattedEditTime}
        iosPickerMode={model.state.iosPickerMode}
        getEditBaseDate={model.schedule.getEditBaseDate}
        handleIosPickerChange={model.schedule.handleIosPickerChange}
        closeIosPicker={model.schedule.closeIosPicker}
        handleBackToEditRoute={model.editor.handleBackToEditRoute}
        handleSaveTrip={model.actions.handleSaveTrip}
        isSavingTrip={model.state.isSavingTrip}
      />

      <LocationPickerModal
        visible={model.state.editRoutePickerTarget !== null}
        title={model.state.editRoutePickerTarget === 'departure' ? 'Choisir le départ' : "Choisir l'arrivée"}
        initialLocation={
          model.state.editRoutePickerTarget === 'departure' ? model.state.editDepartureSelection : model.state.editArrivalSelection
        }
        autoLocateOnOpen={false}
        onClose={model.editor.restoreEditModalAfterPicker}
        onSelect={(location) => {
          const target = model.state.editRoutePickerTarget;
          model.state.setEditRouteMode('map');
          if (target === 'departure') {
            model.state.setEditDepartureSelection(location);
            model.state.setEditDepartureManualAddress(location.title || location.address);
          } else if (target === 'arrival') {
            model.state.setEditArrivalSelection(location);
            model.state.setEditArrivalManualAddress(location.title || location.address);
          }
          model.editor.restoreEditModalAfterPicker();
        }}
      />

      <Modal transparent animationType="fade" visible={Boolean(model.state.deleteTarget)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Ionicons name="trash" size={28} color={Colors.danger} />
            </View>
            <Text style={styles.confirmTitle}>Supprimer ce trajet ?</Text>
            <Text style={styles.confirmText}>
              Cette action est irréversible. Les passagers seront informés de l&apos;annulation.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={model.closeDeleteModal}
              >
                <Text style={styles.modalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  styles.modalButtonDanger,
                  { marginRight: 0 },
                ]}
                onPress={model.actions.handleConfirmDelete}
                disabled={model.state.isDeletingTrip}
              >
                {model.state.isDeletingTrip ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <TutorialOverlay
        visible={model.state.tripsGuideVisible}
        title="Gérez vos trajets"
        message="Retrouvez vos trajets publiés, modifiez-les ou publiez un nouveau trajet depuis ce tableau de bord."
        onDismiss={model.dismissTripsGuide}
      />
    </SafeAreaView>
  );
}

