import { useManageTripController } from '../../../hooks/manage-trip/useManageTripController';
import { DriverTripAccessGuard } from '@/components/trip/DriverTripAccessGuard';
import { ManageTripContent } from '../../../features/manage-trip/ManageTripContent';
import { ManageTripActionsFooter } from '../../../features/manage-trip/ManageTripActionsFooter';
import { ManageTripContactModal } from '@/features/manage-trip/ManageTripContactModal';
import { labelStatus, statusColor } from '../../../features/manage-trip/manageTripStatus';
import { styles } from '../../../features/screen-styles/app/trip/manage/detail/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import TripSecurityPanel from '@/components/trip/TripSecurityPanel';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ManageTripScreen() {
  return <DriverTripAccessGuard><OwnerManageTripScreen /></DriverTripAccessGuard>;
}

function OwnerManageTripScreen() {
  const model = useManageTripController();

  if (!model.state.tripId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Trajet introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!model.trip && (model.state.tripLoading || model.state.tripFetching)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.emptyText}>Chargement du trajet…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!model.trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.emptyText}>Trajet introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!model.state.isOwner) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="lock-closed" size={32} color={Colors.primary} />
          <Text style={[styles.emptyText, { marginTop: Spacing.sm }]}>
            Vous n’avez pas l’autorisation d’accéder à ce trajet.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: Spacing.lg, paddingHorizontal: Spacing.xl }]}
            onPress={model.state.goHome}
          >
            <Text style={styles.primaryButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!model.state.isIdentityVerified) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="shield-outline" size={34} color={Colors.primary} />
          <Text style={[styles.emptyText, { marginTop: Spacing.sm }]}>
            Votre identité doit être vérifiée pour gérer vos trajets.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { marginTop: Spacing.lg }]}
            onPress={() => model.state.router.push('/profile')}
          >
            <Text style={styles.primaryButtonText}>Vérifier mon identité</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={model.state.goHome}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Gestion du trajet</Text>
          <View style={styles.headerBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(model.trip.status).color }]} />
            <Text style={[styles.headerSubtitle, { color: statusColor(model.trip.status).color }]}>
              {labelStatus(model.trip.status)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={model.refreshAll}
          disabled={model.state.tripFetching || model.state.bookingsFetching}
          activeOpacity={0.7}
        >
          {model.state.tripFetching || model.state.bookingsFetching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh" size={20} color={Colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {model.state.feedback && (
        <Animated.View
          entering={FadeInDown}
          style={[
            styles.feedbackBanner,
            model.state.feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}
        >
          <Ionicons
            name={model.state.feedback.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={Colors.white}
          />
          <Text style={styles.feedbackText}>{model.state.feedback.message}</Text>
          <TouchableOpacity onPress={() => model.state.setFeedback(null)}>
            <Ionicons name="close" size={18} color={Colors.white} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ManageTripContent
        state={model.state}
        refreshAll={model.refreshAll}
        routeEditor={model.routeEditor}
        tracking={model.tracking}
        actions={model.actions}
        bookingsActions={model.bookingsActions}
        openTripSecurityModal={model.openTripSecurityModal}
      />

      {/* Sticky Footer pour les actions du trajet */}
      <ManageTripActionsFooter
        state={model.state}
        actions={model.actions}
        canCompleteTrip={model.canCompleteTrip}
      />

      <Modal
        animationType="slide"
        transparent
        visible={model.state.securityModalVisible}
        onRequestClose={model.closeTripSecurityModal}
      >
        <View style={styles.securityModalOverlay}>
          <TouchableOpacity
            style={styles.securityModalBackdrop}
            activeOpacity={1}
            onPress={model.closeTripSecurityModal}
          />
          <View
            style={[
              styles.securityModalContent,
              { paddingBottom: Math.max(model.state.insets.bottom, Spacing.md) + Spacing.md },
            ]}
          >
            <View style={styles.securityModalHeader}>
              <Text style={styles.securityModalTitle}>Sécurité du trajet</Text>
              <TouchableOpacity
                style={styles.securityModalCloseButton}
                onPress={model.closeTripSecurityModal}
              >
                <Ionicons name="close" size={22} color={Colors.gray[700]} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.securityModalBody}
              contentContainerStyle={styles.securityModalBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TripSecurityPanel
                tripId={model.trip.id}
                role="driver"
                tripStatus={model.trip.status}
                openSelectorByDefault={model.state.securityModalVisible}
                compact
              />
            </ScrollView>
          </View>
        </View>
      </Modal>


      <Modal
        animationType="slide"
        transparent
        visible={model.state.editRouteModalVisible}
        onRequestClose={model.routeEditor.closeEditRouteModal}
      >
        <View style={styles.bookingModalOverlay}>
          <View style={[styles.bookingModalCard, { paddingBottom: Math.max(model.state.insets.bottom, 16) + 24 }]}>
            <Text style={styles.bookingModalTitle}>Modifier le trajet</Text>
            <Text style={styles.bookingModalDescription}>
              {"Mettez à jour l'adresse de départ et/ou d'arrivée."}
            </Text>

            <Text style={styles.editRouteLabel}>Adresse de départ</Text>
            <TextInput
              style={styles.editRouteInput}
              placeholder="Ex: avenue Kasa-Vubu, Bandal"
              placeholderTextColor={Colors.gray[400]}
              value={model.state.editDepartureAddress}
              onChangeText={(text) => {
                model.state.setEditDepartureAddress(text);
                if (model.state.editRouteError) model.state.setEditRouteError('');
              }}
              editable={!model.state.isSavingRoute}
            />

            <Text style={styles.editRouteLabel}>{"Adresse d'arrivée"}</Text>
            <TextInput
              style={styles.editRouteInput}
              placeholder="Ex: rond-point Victoire"
              placeholderTextColor={Colors.gray[400]}
              value={model.state.editArrivalAddress}
              onChangeText={(text) => {
                model.state.setEditArrivalAddress(text);
                if (model.state.editRouteError) model.state.setEditRouteError('');
              }}
              editable={!model.state.isSavingRoute}
            />

            {model.state.editRouteError ? <Text style={styles.bookingModalError}>{model.state.editRouteError}</Text> : null}

            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={model.routeEditor.closeEditRouteModal}
                disabled={model.state.isSavingRoute}
              >
                <Text style={styles.bookingModalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={model.routeEditor.handleSaveRouteAddresses}
                disabled={model.state.isSavingRoute}
              >
                {model.state.isSavingRoute ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.bookingModalButtonPrimaryText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      <Modal animationType="slide" transparent visible={model.state.rejectModalVisible}>
        <View style={styles.bookingModalOverlay}>
          <View style={[styles.bookingModalCard, { paddingBottom: Math.max(model.state.insets.bottom, 16) + 24 }]}>
            <Text style={styles.bookingModalTitle}>Refuser la réservation</Text>
            <Text style={styles.bookingModalDescription}>
              Expliquez brièvement au passager la raison du refus.
            </Text>
            <TextInput
              style={styles.bookingSeatInput}
              placeholder="Ex: Nombre de places insuffisant"
              placeholderTextColor={Colors.gray[400]}
              value={model.state.rejectReason}
              onChangeText={(text) => {
                model.state.setRejectReason(text);
                if (model.state.rejectError) model.state.setRejectError('');
              }}
              multiline
              editable={!model.state.isRejecting}
            />
            {model.state.rejectError ? <Text style={styles.bookingModalError}>{model.state.rejectError}</Text> : null}
            <View style={styles.bookingModalActions}>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonSecondary]}
                onPress={model.bookingsActions.closeRejectModal}
                disabled={model.state.isRejecting}
              >
                <Text style={styles.bookingModalButtonSecondaryText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookingModalButton, styles.bookingModalButtonPrimary]}
                onPress={model.bookingsActions.handleRejectSubmit}
                disabled={model.state.isRejecting}
              >
                {model.state.isRejecting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.bookingModalButtonPrimaryText}>Confirmer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>


      <ManageTripContactModal state={model.state} bookings={model.tracking.visibleBookings} />
    </SafeAreaView>
  );
}
