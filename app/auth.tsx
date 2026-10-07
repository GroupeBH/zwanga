import { useAuthController } from '../hooks/auth/useAuthController';
import { useAuthKeyboardLayout } from '../hooks/auth/useAuthKeyboardLayout';
import { authCodeStyles } from '@/features/auth/authCode.styles';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import { normalizeLegalName } from '@/utils/legalIdentity';
import React from 'react';
import { Redirect } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AuthHeader,
  GoogleOtpStep,
  GooglePhoneStep,
  KycStep,
  PhoneStep,
  PinStep,
  ProfileStep,
  ResetPinStep,
  SmsStep,
  VehicleModal,
  authStyles as styles,
} from '@/components/auth';

export default function AuthScreen() {
  const { isAuthenticated, draftPersistence, form, navigation, canGoBack, progress, motivationalMessage, showPhoneStep, phoneActions, social, isAppleAuthLoading, legacyReferralCode, isGoogleSignupActive, profileActions, registration } = useAuthController();
  const compactCodeStep = form.step === 'resetPin' || (form.step === 'pin' && form.mode === 'login');
  const keyboard = useAuthKeyboardLayout(compactCodeStep, `${form.step}:${form.resetPinStep}`);
  const resetPending = form.step === 'resetPin' && (phoneActions.isResettingPin || form.isSendingResetOtp);
  if (isAuthenticated && form.step !== 'kyc') return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={styles.container} edges={keyboard.keyboardVisible ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}>
      {draftPersistence.saveFailed && <Text accessibilityRole="alert" style={{ paddingHorizontal: 20, color: '#9a3412' }}>
        La reprise automatique est indisponible pour le moment. Gardez Zwanga ouvert pour conserver cette étape.
      </Text>}
      <AuthHeader
        mode={form.mode}
        onModeChange={(mode) => { if (!resetPending && !social.isSocialAuthInFlight() && !phoneActions.isPinLoginInFlight() && !registration.isRegistrationLocked()) navigation.handleModeChange(mode); }}
        canGoBack={compactCodeStep || canGoBack}
        compact={keyboard.keyboardVisible}
        onBack={() => { if (!resetPending && !social.isSocialAuthInFlight() && !phoneActions.isPinLoginInFlight() && !registration.isRegistrationLocked()) navigation.handlePreviousStep(); }}
        disabled={resetPending || social.isGoogleLoading || isAppleAuthLoading || phoneActions.isPinLoginPending || form.isLoggingIn || registration.isRegistrationPending || registration.hasCreatedAccount}
        progress={progress}
        motivationalMessage={motivationalMessage}
      />

      {form.isResumingProfile && form.step === 'pin' && <Text style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
        Votre profil a été conservé. Par sécurité, saisissez de nouveau votre PIN pour poursuivre.
      </Text>}
      <KeyboardAvoidingView
        // Android already resizes this activity (adjustResize); avoid a second inset.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={Platform.OS === 'ios' || !compactCodeStep}
        style={authCodeStyles.viewport}
        keyboardVerticalOffset={compactCodeStep || Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          ref={keyboard.scrollRef}
          style={[styles.scrollView, authCodeStyles.viewport]}
          contentContainerStyle={[styles.scrollViewContent, compactCodeStep && authCodeStyles.content]}
          automaticallyAdjustKeyboardInsets={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          bounces={!compactCodeStep}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Phone Step */}
          {showPhoneStep && (
            <PhoneStep
              mode={form.mode}
              phone={form.phone}
              onPhoneChange={form.setPhone}
              onSubmit={() => { if (!social.isSocialAuthInFlight()) void phoneActions.handlePhoneSubmit(); }}
              onGoogleAuth={form.mode === 'login' ? social.handleGoogleLogin : social.handleGoogleSignupStart}
              onAppleAuth={form.mode === 'login' ? social.handleAppleLogin : social.handleAppleSignupStart}
              isLoading={form.isSendingOtpMutation}
              isGoogleLoading={social.isGoogleLoading || form.isGoogleMobileLoading || form.isSendingGoogleOtp || form.isVerifyingGoogleOtp}
              isAppleLoading={isAppleAuthLoading}
              isAppleAvailable={form.isAppleAvailable}
              hasReferralAttribution={Boolean(form.referralAttribution || legacyReferralCode)}
              referrerFirstName={form.referralAttribution?.referrerFirstName}
            />
          )}

          {/* Google Phone Step */}
          {isGoogleSignupActive && form.googleSignupStep === 'phone' && (
            <GooglePhoneStep
              profileName={form.googleProfileName}
              provider={form.socialProvider ?? 'google'}
              phone={form.googlePhone}
              onPhoneChange={form.setGooglePhone}
              onSubmit={social.handleSendGoogleOtp}
              onCancel={social.handleGoogleCancel}
              isLoading={form.isSendingGoogleOtp}
              submitLabel={isSignupOtpVerificationEnabled ? 'Recevoir le code' : 'Continuer'}
            />
          )}

          {/* Google OTP Step */}
          {isSignupOtpVerificationEnabled && isGoogleSignupActive && form.googleSignupStep === 'otp' && (
            <GoogleOtpStep
              phone={form.googlePhone}
              otp={form.googleOtp}
              otpRefs={form.googleOtpRefs}
              onOtpChange={form.setGoogleOtp}
              onVerify={social.handleVerifyGoogleOtpAndContinue}
              onResend={social.handleResendGoogleOtp}
              onBack={social.handleGooglePhoneBack}
              isVerifying={form.isVerifyingGoogleOtp}
              isResending={form.isSendingGoogleOtp}
            />
          )}

          {/* Phone verification step */}
          {isSignupOtpVerificationEnabled && form.step === 'sms' && (
            <SmsStep
              mode={form.mode}
              phone={form.phone}
              smsCode={form.smsCode}
              smsInputRefs={form.smsInputRefs}
              onSmsCodeChange={form.setSmsCode}
              onSubmit={phoneActions.handleSmsSubmit}
              onResend={phoneActions.handlePhoneSubmit}
              isVerifying={form.isVerifyingOtp || form.isLoggingIn}
              isResending={form.isSendingOtpMutation}
            />
          )}

          {/* PIN Step */}
          {form.step === 'pin' && (
            <PinStep
              keyboardVisible={keyboard.keyboardVisible}
              mode={form.mode}
              pin={form.pin}
              pinConfirm={form.pinConfirm}
              pinInputRef={form.pinInputRef}
              pinConfirmInputRef={form.pinConfirmInputRef}
              onPinChange={phoneActions.handlePinChange}
              onPinConfirmChange={phoneActions.handlePinConfirmChange}
              onSubmit={phoneActions.handlePinSubmit}
              onForgotPin={form.mode === 'login' ? phoneActions.handleForgotPin : undefined}
              isLoading={form.isLoggingIn || phoneActions.isPinLoginPending}
            />
          )}

          {/* Reset PIN Step */}
          {form.step === 'resetPin' && (
            <ResetPinStep
              keyboardVisible={keyboard.keyboardVisible}
              phone={form.phone}
              resetPinStep={form.resetPinStep}
              otpCode={form.resetOtpCode}
              otpInputRefs={form.resetOtpInputRefs}
              newPin={form.resetNewPin}
              newPinConfirm={form.resetNewPinConfirm}
              pinInputRef={form.resetPinInputRef}
              pinConfirmInputRef={form.resetPinConfirmInputRef}
              onOtpChange={form.setResetOtpCode}
              onPinChange={phoneActions.handleResetPinChange}
              onPinConfirmChange={phoneActions.handleResetPinConfirmChange}
              onVerifyOtp={phoneActions.handleVerifyResetOtp}
              onResetPin={phoneActions.handleResetPinSubmit}
              onResendOtp={phoneActions.handleForgotPin}
              isResending={form.isSendingResetOtp}
              isLoading={phoneActions.isResettingPin}
            />
          )}

          {/* Profile Step - Normal signup ou Google signup après OTP */}
          {form.step === 'profile' && form.mode === 'signup' && (!isGoogleSignupActive || form.googleSignupStep === 'profile') && (
            <ProfileStep
              firstName={form.firstName}
              lastName={form.lastName}
              showNameFields={!form.isAppleSignupFlow}
              profilePicture={form.profilePicture}
              gender={form.gender}
              hasReferralAttribution={Boolean(form.referralAttribution || legacyReferralCode)}
              referrerFirstName={form.referralAttribution?.referrerFirstName}
              role={form.role}
              vehicleType={form.vehicleType}
              vehicleBrand={form.vehicleBrand}
              vehicleModel={form.vehicleModel}
              vehicleColor={form.vehicleColor}
              vehiclePlate={form.vehiclePlate}
              onFirstNameChange={form.setFirstName}
              onLastNameChange={form.setLastName}
              onSelectProfilePicture={profileActions.handleSelectProfilePicture}
              isSelectingPhoto={profileActions.isSelectingProfilePhoto}
              onGenderChange={form.setGender}
              onRoleChange={form.setRole}
              onVehicleTypeChange={form.setVehicleType}
              onOpenVehicleModal={() => form.setVehicleModalVisible(true)}
              onContinue={profileActions.validateProfileAndContinue}
              isLoading={registration.isRegistrationPending}
              hasCreatedAccount={registration.hasCreatedAccount}
            />
          )}

          {/* KYC Step */}
          {form.step === 'kyc' && form.role === 'driver' && (
            <KycStep
              onFinish={registration.handleFinalRegister}
              onEditIdentity={form.isAppleSignupFlow ? undefined : () => form.setStep('profile')}
              isLoading={registration.isRegistrationPending || form.isRegistering || form.isStartingDiditKyc}
              hasCreatedAccount={registration.hasCreatedAccount}
              firstName={normalizeLegalName(form.firstName)}
              lastName={normalizeLegalName(form.lastName)}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <VehicleModal
        visible={form.vehicleModalVisible}
        onClose={() => form.setVehicleModalVisible(false)}
        vehicleBrand={form.vehicleBrand}
        vehicleModel={form.vehicleModel}
        vehicleColor={form.vehicleColor}
        vehiclePlate={form.vehiclePlate}
        onBrandChange={form.setVehicleBrand}
        onModelChange={form.setVehicleModel}
        onColorChange={form.setVehicleColor}
        onPlateChange={form.setVehiclePlate}
      />
    </SafeAreaView>
  );
}
