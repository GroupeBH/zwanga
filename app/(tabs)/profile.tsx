import { TutorialOverlay } from '@/components/TutorialOverlay';
import { VehicleFormModal } from '@/components/VehicleFormModal';
import { ProfileDashboard } from '@/components/profile/ProfileDashboard';
import { ProfileDocumentsCard } from '@/components/profile/ProfileDocumentsCard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileMenu } from '@/components/profile/ProfileMenu';
import { ProfilePinModal } from '@/components/profile/ProfilePinModal';
import { ProfileProCard } from '@/components/profile/ProfileProCard';
import { ProfileReferralCard } from '@/components/profile/ProfileReferralCard';
import { ProfileReviewsModal } from '@/components/profile/ProfileReviewsModal';
import { ProfileReviewsSection } from '@/components/profile/ProfileReviewsSection';
import { ProfileSubscriptionModal } from '@/components/profile/ProfileSubscriptionModal';
import { ProfileVehiclesSection } from '@/components/profile/ProfileVehiclesSection';
import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileScreen.styles';
import { useProfileController } from '@/hooks/profile/useProfileController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const profile = useProfileController();
  return ((
    <SafeAreaView style={styles.container} edges={['top']}>
      {profile.isProfileDataLoading ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityLabel="Chargement du profil et des véhicules"
          style={styles.profileLoadingContainer}
        >
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.profileLoadingTitle}>Chargement du profil…</Text>
          <Text style={styles.profileLoadingMessage}>
            Récupération de vos informations.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={profile.refreshing} onRefresh={profile.handleRefresh} />}
        >
          <ProfileHeader
            changeProfilePhoto={profile.changeProfilePhoto}
            currentUser={profile.currentUser}
            displaysDriverRole={profile.displaysDriverRole}
            isPremiumActive={profile.isPremiumActive}
            isUploading={profile.isUploading}
            router={profile.router}
            user={profile.user}
          />

          <View style={styles.mainActionsContainer}>
            <ProfileDashboard
              driverStatusItems={profile.driverStatusItems}
              driverTripsCount={profile.driverTripsCount}
              handleOpenKycModal={profile.handleOpenKycModal}
              isDriver={profile.isDriver}
              isKycApproved={profile.isKycApproved}
              isKycPending={profile.isKycPending}
              isKycBusy={profile.isKycBusy}
              kycLoading={profile.kycLoading}
              isKycRejected={profile.isKycRejected}
              isPriorityCtaBusy={profile.isPriorityCtaBusy}
              kycStatus={profile.kycStatus}
              priorityCta={profile.priorityCta}
              quickActionItems={profile.quickActionItems}
            />

            <ProfileReferralCard
              referralSummary={profile.referralSummary}
              router={profile.router}
            />

            <ProfileProCard
              handleStartDriverOnboarding={profile.handleStartDriverOnboarding}
              handleSubscribePro={profile.handleSubscribePro}
              isPremiumActive={profile.isPremiumActive}
              isUpdatingUser={profile.isUpdatingUser}
              needsDriverOnboarding={profile.needsDriverOnboarding}
              premiumOverview={profile.premiumOverview}
              proBusy={profile.proBusy}
              proEndDateLabel={profile.proEndDateLabel}
              proPriceLabel={profile.proPriceLabel}
              shouldShowProDetailsCard={profile.shouldShowProDetailsCard}
            />

            <ProfileDocumentsCard
              handleOpenDocumentsPack={profile.handleOpenDocumentsPack}
              needsDriverOnboarding={profile.needsDriverOnboarding}
              openingDocumentsPack={profile.openingDocumentsPack}
            />
          </View>

          <ProfileReviewsSection
            featuredReviews={profile.featuredReviews}
            reviewAverage={profile.reviewAverage}
            reviewCount={profile.reviewCount}
            setReviewsModalVisible={profile.setReviewsModalVisible}
          />

          {(profile.isDriver || profile.hasVehicle) && <ProfileVehiclesSection
            deletingVehicle={profile.deletingVehicle}
            handleDeleteVehicle={profile.handleDeleteVehicle}
            openCreateVehicleModal={profile.openCreateVehicleModal}
            openEditVehicleModal={profile.openEditVehicleModal}
            refetchVehicles={profile.refetchVehicles}
            shouldShowVehicleLoadError={profile.shouldShowVehicleLoadError}
            updatingVehicle={profile.updatingVehicle}
            vehicleList={profile.vehicleList}
            vehiclesFetching={profile.vehiclesFetching}
            vehiclesLoading={profile.vehiclesLoading}
          />}

          <ProfileMenu
            menuItems={profile.menuItems}
            router={profile.router}
          />

          <View style={styles.logoutContainer}>
            <TouchableOpacity style={styles.logoutButton} onPress={profile.handleLogout}>
              <View style={styles.logoutButtonContent}>
                <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
                <Text style={styles.logoutText}>Déconnexion</Text>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <VehicleFormModal
        visible={profile.vehicleModalVisible}
        {...profile.vehicleModalCopy}
        submitLabel={profile.editingVehicleId ? 'Enregistrer' : 'Ajouter'}
        vehicleType={profile.vehicleType}
        brand={profile.vehicleBrand}
        model={profile.vehicleModel}
        color={profile.vehicleColor}
        licensePlate={profile.vehiclePlate}
        onVehicleTypeChange={(value) => {
          profile.setVehicleType(value);
          profile.setVehicleFormError(null);
        }}
        onBrandChange={profile.handleVehicleBrandChange}
        onModelChange={profile.handleVehicleModelChange}
        onColorChange={profile.handleVehicleColorChange}
        onLicensePlateChange={profile.handleVehiclePlateChange}
        onClose={profile.closeVehicleModal}
        onSubmit={profile.handleSaveVehicle}
        submitting={profile.creatingVehicle || profile.updatingVehicle}
        errorMessage={profile.vehicleFormError}
      />

      <ProfileReviewsModal
        insets={profile.insets}
        reviews={profile.reviews}
        reviewsModalVisible={profile.reviewsModalVisible}
        setReviewsModalVisible={profile.setReviewsModalVisible}
      />

      <ProfilePinModal
        currentUser={profile.currentUser}
        handleForgotPin={profile.handleForgotPin}
        handleNewPinChange={profile.handleNewPinChange}
        handleNewPinConfirmChange={profile.handleNewPinConfirmChange}
        handleOldPinChange={profile.handleOldPinChange}
        handleOtpInputChange={profile.handleOtpInputChange}
        handleOtpKeyPress={profile.handleOtpKeyPress}
        handleUpdatePin={profile.handleUpdatePin}
        handleVerifyOldPin={profile.handleVerifyOldPin}
        handleVerifyOtpForPinChange={profile.handleVerifyOtpForPinChange}
        isSendingOtp={profile.isSendingOtp}
        isUpdatingPin={profile.isUpdatingPin}
        isUpdatingPinWithOtp={profile.isUpdatingPinWithOtp}
        newPin={profile.newPin}
        newPinConfirm={profile.newPinConfirm}
        oldPin={profile.oldPin}
        oldPinInputRef={profile.oldPinInputRef}
        otpCode={profile.otpCode}
        otpInputRefs={profile.otpInputRefs}
        pinConfirmInputRef={profile.pinConfirmInputRef}
        pinInputRef={profile.pinInputRef}
        pinModalVisible={profile.pinModalVisible}
        pinStep={profile.pinStep}
        setPinModalVisible={profile.setPinModalVisible}
      />

      <ProfileSubscriptionModal
        closeSubscriptionModal={profile.closeSubscriptionModal}
        handleBackToSubscriptionMethod={profile.handleBackToSubscriptionMethod}
        handleContinueSubscriptionPayment={profile.handleContinueSubscriptionPayment}
        handleSubmitSubscriptionPayment={profile.handleSubmitSubscriptionPayment}
        insets={profile.insets}
        isCheckingSubscriptionPayment={profile.isCheckingSubscriptionPayment}
        isRestoringSubscriptionPayment={profile.isRestoringSubscriptionPayment}
        isSubscribingPro={profile.isSubscribingPro}
        isSubscriptionCardPayment={profile.isSubscriptionCardPayment}
        isSubscriptionPaymentAutoChecking={profile.isSubscriptionPaymentAutoChecking}
        proBusy={profile.proBusy}
        proPriceLabel={profile.proPriceLabel}
        selectedSubscriptionPaymentChannel={profile.selectedSubscriptionPaymentChannel}
        selectedSubscriptionPaymentOption={profile.selectedSubscriptionPaymentOption}
        setSelectedSubscriptionPaymentChannel={profile.setSelectedSubscriptionPaymentChannel}
        setSubscriptionModalStep={profile.setSubscriptionModalStep}
        setSubscriptionPhone={profile.setSubscriptionPhone}
        shouldShowPaymentStatusPanel={profile.shouldShowPaymentStatusPanel}
        subscriptionModalCardKeyboardStyle={profile.subscriptionModalCardKeyboardStyle}
        subscriptionModalStep={profile.subscriptionModalStep}
        subscriptionModalVisible={profile.subscriptionModalVisible}
        subscriptionPaymentOrderNumber={profile.subscriptionPaymentOrderNumber}
        subscriptionPaymentProgressSteps={profile.subscriptionPaymentProgressSteps}
        subscriptionPaymentStage={profile.subscriptionPaymentStage}
        subscriptionPaymentStatus={profile.subscriptionPaymentStatus}
        subscriptionPhone={profile.subscriptionPhone}
      />

      {profile.isKycBusy ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityLabel="En attente d'ouverture de la validation d'identité"
          style={styles.kycLaunchOverlay}
        >
          <View style={styles.kycLaunchCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.kycLaunchTitle}>
              En attente d’ouverture de la validation d’identité…
            </Text>
            <Text style={styles.kycLaunchMessage}>
              Préparation de votre espace sécurisé de vérification.
            </Text>
          </View>
        </View>
      ) : null}

      <TutorialOverlay
        visible={profile.profileGuideVisible}
        title="Votre espace Zwanga"
        message="Consultez vos statistiques, vos avis et votre vérification d’identité. Le bouton Devenir conducteur est distinct de la vérification du profil passager."
        onDismiss={profile.handleDismissProfileGuide}
      />
    </SafeAreaView>
  ));
}
