import { useAuthController } from '../hooks/auth/useAuthController';
import { isSignupOtpVerificationEnabled } from '@/config/env';
import { normalizeLegalName } from '@/utils/legalIdentity';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
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
  const { form, navigation, canGoBack, progress, motivationalMessage, showPhoneStep, phoneActions, social, isAppleAuthLoading, legacyReferralCode, isGoogleSignupActive, profileActions, registration } = useAuthController();

  return (
    <SafeAreaView style={styles.container}>
      <AuthHeader
        mode={form.mode}
        onModeChange={navigation.handleModeChange}
        canGoBack={canGoBack}
        onBack={navigation.handlePreviousStep}
        progress={progress}
        motivationalMessage={motivationalMessage}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Phone Step */}
          {showPhoneStep && (
            <PhoneStep
              mode={form.mode}
              phone={form.phone}
              onPhoneChange={form.setPhone}
              onSubmit={phoneActions.handlePhoneSubmit}
              onGoogleAuth={form.mode === 'login' ? social.handleGoogleLogin : social.handleGoogleSignupStart}
              onAppleAuth={form.mode === 'login' ? social.handleAppleLogin : social.handleAppleSignupStart}
              isLoading={form.isSendingOtpMutation}
              isGoogleLoading={form.isGoogleMobileLoading || form.isSendingGoogleOtp || form.isVerifyingGoogleOtp}
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

          {/* SMS Step */}
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
              mode={form.mode}
              pin={form.pin}
              pinConfirm={form.pinConfirm}
              pinInputRef={form.pinInputRef}
              pinConfirmInputRef={form.pinConfirmInputRef}
              onPinChange={phoneActions.handlePinChange}
              onPinConfirmChange={phoneActions.handlePinConfirmChange}
              onSubmit={phoneActions.handlePinSubmit}
              onForgotPin={form.mode === 'login' ? phoneActions.handleForgotPin : undefined}
              isLoading={form.isLoggingIn}
            />
          )}

          {/* Reset PIN Step */}
          {form.step === 'resetPin' && (
            <ResetPinStep
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
              onGenderChange={form.setGender}
              onRoleChange={form.setRole}
              onVehicleTypeChange={form.setVehicleType}
              onOpenVehicleModal={() => form.setVehicleModalVisible(true)}
              onContinue={profileActions.validateProfileAndContinue}
            />
          )}

          {/* KYC Step */}
          {form.step === 'kyc' && form.role === 'driver' && (
            <KycStep
              onFinish={registration.handleFinalRegister}
              onEditIdentity={form.isAppleSignupFlow ? undefined : () => form.setStep('profile')}
              isLoading={form.isRegistering || form.isStartingDiditKyc}
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
