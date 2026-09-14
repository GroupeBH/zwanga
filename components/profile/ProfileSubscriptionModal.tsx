import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import {
  normalizePaymentPhone,
  SUBSCRIPTION_PAYMENT_OPTIONS
} from '@/features/profile/profileModel';
import { styles } from '@/features/profile/ProfileSubscriptionModal.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'closeSubscriptionModal'
  | 'handleBackToSubscriptionMethod'
  | 'handleContinueSubscriptionPayment'
  | 'handleSubmitSubscriptionPayment'
  | 'insets'
  | 'isCheckingSubscriptionPayment'
  | 'isRestoringSubscriptionPayment'
  | 'isSubscribingPro'
  | 'isSubscriptionCardPayment'
  | 'isSubscriptionPaymentAutoChecking'
  | 'proBusy'
  | 'proPriceLabel'
  | 'selectedSubscriptionPaymentChannel'
  | 'selectedSubscriptionPaymentOption'
  | 'setSelectedSubscriptionPaymentChannel'
  | 'setSubscriptionModalStep'
  | 'setSubscriptionPhone'
  | 'shouldShowPaymentStatusPanel'
  | 'subscriptionModalCardKeyboardStyle'
  | 'subscriptionModalStep'
  | 'subscriptionModalVisible'
  | 'subscriptionPaymentOrderNumber'
  | 'subscriptionPaymentProgressSteps'
  | 'subscriptionPaymentStage'
  | 'subscriptionPaymentStatus'
  | 'subscriptionPhone'
>;

export function ProfileSubscriptionModal({
  closeSubscriptionModal,
  handleBackToSubscriptionMethod,
  handleContinueSubscriptionPayment,
  handleSubmitSubscriptionPayment,
  insets,
  isCheckingSubscriptionPayment,
  isRestoringSubscriptionPayment,
  isSubscribingPro,
  isSubscriptionCardPayment,
  isSubscriptionPaymentAutoChecking,
  proBusy,
  proPriceLabel,
  selectedSubscriptionPaymentChannel,
  selectedSubscriptionPaymentOption,
  setSelectedSubscriptionPaymentChannel,
  setSubscriptionModalStep,
  setSubscriptionPhone,
  shouldShowPaymentStatusPanel,
  subscriptionModalCardKeyboardStyle,
  subscriptionModalStep,
  subscriptionModalVisible,
  subscriptionPaymentOrderNumber,
  subscriptionPaymentProgressSteps,
  subscriptionPaymentStage,
  subscriptionPaymentStatus,
  subscriptionPhone,
}: Props) {
  return (<Modal
    visible={subscriptionModalVisible}
    transparent
    animationType="slide"
    onRequestClose={closeSubscriptionModal}
  >
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.subscriptionModalOverlay}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <TouchableOpacity
        style={styles.subscriptionModalBackdrop}
        activeOpacity={1}
        onPress={closeSubscriptionModal}
      />
      <Animated.View
        entering={FadeInDown}
        style={[
          styles.subscriptionModalCard,
          { paddingBottom: Math.max(insets.bottom, Spacing.lg) },
          subscriptionModalCardKeyboardStyle,
        ]}
      >
        <View style={styles.subscriptionModalHandle} />
        <LinearGradient
          colors={['#FFF7ED', '#FFFFFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.subscriptionModalHero}
        >
          <View style={styles.subscriptionHeaderTopRow}>
            <View style={styles.subscriptionHeaderBadge}>
              <Ionicons name="sparkles-outline" size={14} color={Colors.primaryDark} />
              <Text style={styles.subscriptionHeaderBadgeText}>Conducteur Pro</Text>
            </View>
            <TouchableOpacity
              onPress={closeSubscriptionModal}
              disabled={proBusy}
              style={styles.subscriptionModalCloseButton}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={18} color={Colors.gray[700]} />
            </TouchableOpacity>
          </View>

          <View style={styles.subscriptionModalHeader}>
            <View style={styles.subscriptionModalHeaderTextBlock}>
              <Text style={styles.subscriptionModalTitle}>Abonnement conducteur</Text>
              <Text style={styles.subscriptionModalSubtitle}>
                Pour publier au-delà des 5 trajets inclus chaque jour.
              </Text>
            </View>

            <View style={styles.subscriptionModalPricePill}>
              <Text style={styles.subscriptionModalPrice}>{proPriceLabel}</Text>
              <Text style={styles.subscriptionModalPriceCaption}>par mois</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.subscriptionStepIndicator}>
          <View
            style={[
              styles.subscriptionStepPill,
              subscriptionModalStep === 'method' && styles.subscriptionStepPillActive,
            ]}
          >
            <Text
              style={[
                styles.subscriptionStepText,
                subscriptionModalStep === 'method' && styles.subscriptionStepTextActive,
              ]}
            >
              1. Méthode
            </Text>
          </View>
          <View
            style={[
              styles.subscriptionStepPill,
              subscriptionModalStep === 'payment' && styles.subscriptionStepPillActive,
            ]}
          >
            <Text
              style={[
                styles.subscriptionStepText,
                subscriptionModalStep === 'payment' && styles.subscriptionStepTextActive,
              ]}
            >
              2. Paiement
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          style={styles.subscriptionModalScroll}
          contentContainerStyle={styles.subscriptionModalContent}
        >
          {subscriptionModalStep === 'method' ? (
            <>
              <Text style={styles.subscriptionSectionLabel}>Moyen de paiement</Text>
              <View style={styles.subscriptionPaymentGrid}>
                {SUBSCRIPTION_PAYMENT_OPTIONS.map((option) => {
                  const isSelected = selectedSubscriptionPaymentChannel === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.subscriptionPaymentOption,
                        isSelected && styles.subscriptionPaymentOptionActive,
                        subscriptionPaymentOrderNumber && styles.subscriptionButtonDisabled,
                      ]}
                      disabled={proBusy}
                      onPress={() => {
                        if (subscriptionPaymentOrderNumber) {
                          setSubscriptionModalStep('payment');
                          return;
                        }
                        setSelectedSubscriptionPaymentChannel(option.id);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={option.icon}
                        size={20}
                        color={isSelected ? Colors.primary : Colors.gray[600]}
                      />
                      <View style={styles.subscriptionPaymentOptionText}>
                        <Text style={styles.subscriptionPaymentOptionLabel}>{option.label}</Text>
                        <Text style={styles.subscriptionPaymentOptionHint}>{option.hint}</Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.subscriptionSummaryCard, { marginTop: Spacing.lg }]}>
                <Text style={styles.subscriptionSummaryPrice}>{proPriceLabel}</Text>
                <Text style={styles.subscriptionSummaryText}>
                  {
                    "Le quota gratuit reste à 5 trajets par jour. L'abonnement débloque les publications supplémentaires dès validation du paiement."
                  }
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.subscriptionSectionLabel}>Paiement</Text>
              <View style={styles.subscriptionSelectedMethodCard}>
                <Ionicons name={selectedSubscriptionPaymentOption.icon} size={20} color={Colors.primary} />
                <View style={styles.subscriptionPaymentOptionText}>
                  <Text style={styles.subscriptionPaymentOptionLabel}>
                    {selectedSubscriptionPaymentOption.label}
                  </Text>
                  <Text style={styles.subscriptionPaymentOptionHint}>{selectedSubscriptionPaymentOption.hint}</Text>
                </View>
                <TouchableOpacity
                  onPress={handleBackToSubscriptionMethod}
                  disabled={proBusy}
                  style={styles.subscriptionChangeMethodButton}
                >
                  <Text style={styles.subscriptionChangeMethodText}>Modifier</Text>
                </TouchableOpacity>
              </View>

              {!isSubscriptionCardPayment ? (
                <Animated.View
                  key={selectedSubscriptionPaymentChannel}
                  entering={FadeInDown.duration(300)}
                  style={styles.subscriptionPhoneSection}
                >
                  <Text style={styles.subscriptionSectionLabel}>Numéro Mobile Money</Text>
                  <View style={styles.subscriptionPhoneInputWrapper}>
                    <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
                    <TextInput
                      style={styles.subscriptionPhoneInput}
                      keyboardType="phone-pad"
                      editable={!proBusy}
                      maxLength={13}
                      value={subscriptionPhone}
                      onChangeText={(text) => setSubscriptionPhone(normalizePaymentPhone(text))}
                      placeholder="+243891234567"
                      placeholderTextColor={Colors.gray[400]}
                    />
                  </View>
                  <Text style={styles.subscriptionInputHint}>
                    Format +243 suivi de 9 chiffres. FlexPay enverra une confirmation.
                  </Text>
                </Animated.View>
              ) : (
                <View style={styles.subscriptionSummaryCard}>
                  <Text style={styles.subscriptionSummaryPrice}>{proPriceLabel}</Text>
                  <Text style={styles.subscriptionSummaryText}>
                    {"Le paiement carte s'ouvrira dans une page sécurisée."}
                  </Text>
                </View>
              )}

              {(subscriptionPaymentStage !== 'idle' || subscriptionPaymentOrderNumber) && (
                <View style={styles.subscriptionProgressPanel}>
                  {subscriptionPaymentProgressSteps.map((step, index) => {
                    const isLast = index === subscriptionPaymentProgressSteps.length - 1;
                    const progressColor =
                      step.status === 'done'
                        ? Colors.success
                        : step.status === 'error'
                          ? Colors.danger
                          : step.status === 'paused'
                            ? Colors.warningDark
                            : step.status === 'current'
                              ? Colors.primary
                              : Colors.gray[300];
                    const iconName =
                      step.status === 'done' ? 'checkmark' : step.status === 'error' ? 'close' : step.icon;

                    return (
                      <View key={step.key} style={styles.subscriptionProgressRow}>
                        <View style={styles.subscriptionProgressRail}>
                          <View
                            style={[
                              styles.subscriptionProgressDot,
                              {
                                backgroundColor: step.status === 'waiting' ? Colors.white : progressColor,
                                borderColor: progressColor,
                              },
                            ]}
                          >
                            {step.status === 'current' ? (
                              <ActivityIndicator size="small" color={Colors.white} />
                            ) : (
                              <Ionicons
                                name={iconName}
                                size={13}
                                color={step.status === 'waiting' ? Colors.gray[400] : Colors.white}
                              />
                            )}
                          </View>
                          {!isLast ? (
                            <View
                              style={[
                                styles.subscriptionProgressLine,
                                {
                                  backgroundColor:
                                    step.status === 'done' ? Colors.success + '80' : Colors.gray[200],
                                },
                              ]}
                            />
                          ) : null}
                        </View>
                        <View style={styles.subscriptionProgressTextBlock}>
                          <Text
                            style={[
                              styles.subscriptionProgressTitle,
                              step.status !== 'waiting' && {
                                color: Colors.gray[900],
                              },
                            ]}
                          >
                            {step.title}
                          </Text>
                          <Text style={styles.subscriptionProgressDescription}>{step.description}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

            </>
          )}
        </ScrollView>

        {/* Zone fixe en bas : actions toujours visibles au-dessus du clavier */}
        <View style={styles.subscriptionFixedFooter}>
          {shouldShowPaymentStatusPanel && subscriptionPaymentStatus ? (
            <View style={styles.subscriptionFooterStatusPanel}>
              <View style={styles.subscriptionFooterStatusIcon}>
                {subscriptionPaymentStatus.showActivity ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name={subscriptionPaymentStatus.icon} size={18} color={Colors.primary} />
                )}
              </View>
              <View style={styles.subscriptionFooterStatusContent}>
                <Text style={styles.subscriptionFooterStatusTitle}>{subscriptionPaymentStatus.title}</Text>
                <Text style={styles.subscriptionFooterStatusText}>{subscriptionPaymentStatus.message}</Text>
                {subscriptionPaymentOrderNumber ? (
                  <Text style={styles.subscriptionFooterStatusReference}>
                    Référence {subscriptionPaymentOrderNumber}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <View style={styles.paymentButtonContainer}>
            {subscriptionModalStep === 'payment' && (
              <TouchableOpacity
                style={[styles.subscriptionSecondaryButton, proBusy && styles.subscriptionButtonDisabled]}
                onPress={handleBackToSubscriptionMethod}
                disabled={proBusy}
                activeOpacity={0.85}
              >
                <Text style={styles.subscriptionSecondaryButtonText}>Retour</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.subscriptionPrimaryButton, proBusy && styles.subscriptionButtonDisabled]}
              onPress={
                subscriptionModalStep === 'method'
                  ? subscriptionPaymentOrderNumber
                    ? handleSubmitSubscriptionPayment
                    : handleContinueSubscriptionPayment
                  : handleSubmitSubscriptionPayment
              }
              disabled={proBusy}
              activeOpacity={0.85}
            >
              {subscriptionModalStep === 'payment' &&
                (isSubscribingPro || isCheckingSubscriptionPayment || isRestoringSubscriptionPayment) ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.subscriptionPrimaryButtonText}>
                  {subscriptionPaymentOrderNumber
                    ? isSubscriptionPaymentAutoChecking
                      ? 'Actualiser maintenant'
                      : 'Actualiser le statut'
                    : subscriptionModalStep === 'method'
                      ? 'Suivant'
                      : isSubscriptionCardPayment
                        ? 'Payer par carte'
                        : "Payer l'abonnement"}
                </Text>
              )}
            </TouchableOpacity>

          </View>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>);
}
