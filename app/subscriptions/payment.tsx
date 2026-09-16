import { useSubscriptionPaymentController } from '../../hooks/subscription-payment/useSubscriptionPaymentController';
import {
  PAYMENT_OPTIONS,
  normalizePaymentPhone,
  getPaymentMethodForChannel,
} from '../../features/subscription-payment/paymentModel';
import { styles } from '../../features/screen-styles/app/subscriptions/payment/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

export default function SubscriptionPaymentScreen() {
  const payment = useSubscriptionPaymentController();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : Math.max(payment.state.insets.bottom, Spacing.sm)}
        style={styles.keyboardRoot}
      >
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Retour"
            activeOpacity={0.8}
            onPress={() => payment.state.router.back()}
            style={styles.headerButton}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.gray[900]} />
          </TouchableOpacity>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Paiement Pro</Text>
            <Text style={styles.headerSubtitle}>Suivi FlexPay en temps réel</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel="Actualiser"
              activeOpacity={0.8}
              onPress={payment.recovery.refreshEverything}
              style={styles.headerButton}
            >
              {payment.state.refreshing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={20} color={Colors.gray[900]} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Historique"
              activeOpacity={0.8}
              onPress={() => payment.state.router.push('/payment-history')}
              style={styles.headerButton}
            >
              <Ionicons name="receipt-outline" size={20} color={Colors.gray[900]} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={payment.state.scrollRef}
          contentContainerStyle={[styles.content, payment.state.isCompactHeight && styles.contentCompact]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scrollRoot}
        >
          <LinearGradient
            colors={['#FFF7ED', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.planBand, payment.state.isCompactHeight && styles.planBandCompact]}
          >
            <View style={styles.planHeaderRow}>
              <View style={styles.planBadge}>
                <Ionicons name="sparkles-outline" size={14} color={Colors.primaryDark} />
                <Text style={styles.planBadgeText}>Conducteur {payment.state.planLabel}</Text>
              </View>
              <Text style={styles.planPrice}>{payment.state.priceLabel}</Text>
            </View>
            <Text style={[styles.planTitle, payment.state.isCompactHeight && styles.planTitleCompact]}>
              Abonnement conducteur
            </Text>
            <Text
              numberOfLines={payment.state.isTightHeight ? 1 : 2}
              style={[styles.planText, payment.state.isCompactHeight && styles.planTextCompact]}
            >
              Publiez au-delà des 5 trajets inclus chaque jour. Après paiement : +{payment.state.subscriptionRewardTokens} jetons.
            </Text>
          </LinearGradient>

          <View style={[styles.section, payment.state.isCompactHeight && styles.sectionCompact]}>
            <Text style={styles.sectionLabel}>Moyen de paiement</Text>
            <View style={styles.paymentGrid}>
              {PAYMENT_OPTIONS.map((option) => {
                const isSelected = payment.state.selectedChannel === option.id;
                const disabled = Boolean(payment.state.orderNumber) || payment.presentation.isBusy || payment.state.isAutoChecking;
                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.85}
                    disabled={disabled}
                    onPress={() => {
                      payment.state.setSelectedChannel(option.id);
                      const nextPaymentMethod = getPaymentMethodForChannel(option.id);
                      if (nextPaymentMethod) {
                        payment.state.setPaymentMethod(nextPaymentMethod);
                      }
                    }}
                    style={[
                      styles.paymentOption,
                      isSelected && styles.paymentOptionActive,
                      disabled && styles.disabled,
                    ]}
                  >
                    <Ionicons
                      name={option.icon}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.gray[600]}
                    />
                    <View style={styles.paymentOptionText}>
                      <Text style={styles.paymentOptionLabel}>{option.label}</Text>
                      <Text numberOfLines={1} style={styles.paymentOptionHint}>{option.hint}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {payment.state.isPointsPayment ? (
            <View style={[styles.pointsNotice, payment.state.isCompactHeight && styles.pointsNoticeCompact]}>
              <View style={styles.pointsNoticeIcon}>
                <Ionicons name="wallet-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.pointsNoticeTextBlock}>
                <View style={styles.pointsNoticeRow}>
                  <Text style={styles.pointsNoticeLabel}>Solde</Text>
                  <Text style={styles.pointsNoticeValue}>{payment.state.walletBalanceLabel}</Text>
                </View>
                <View style={styles.pointsNoticeRow}>
                  <Text style={styles.pointsNoticeLabel}>Abonnement</Text>
                  <Text style={styles.pointsNoticeValue}>{payment.state.subscriptionPointsLabel}</Text>
                </View>
              </View>
            </View>
          ) : !payment.state.isCardPayment ? (
            <View
              onLayout={(event) => {
                payment.state.phoneFieldOffsetRef.current = event.nativeEvent.layout.y;
              }}
              style={[styles.section, payment.state.isCompactHeight && styles.sectionCompact]}
            >
              <Text style={styles.sectionLabel}>Numéro Mobile Money</Text>
              <View
                style={[
                  styles.phoneInputWrapper,
                  payment.state.isCompactHeight && styles.phoneInputWrapperCompact,
                  Boolean(payment.state.orderNumber) && styles.disabled,
                ]}
              >
                <Ionicons name="call-outline" size={18} color={Colors.gray[500]} />
                <TextInput
                  editable={!payment.state.orderNumber && !payment.presentation.isBusy && !payment.state.isAutoChecking}
                  keyboardType="phone-pad"
                  maxLength={13}
                  onChangeText={(text) => payment.state.setPhone(normalizePaymentPhone(text))}
                  onFocus={payment.lifecycle.scrollPhoneFieldIntoView}
                  placeholder="+243891234567"
                  placeholderTextColor={Colors.gray[400]}
                  style={styles.phoneInput}
                  value={payment.state.phone}
                />
              </View>
              {!payment.state.isTightHeight ? (
                <Text numberOfLines={1} style={styles.inputHint}>
                  FlexPay enverra une confirmation sur ce numéro. Validez avec votre PIN.
                </Text>
              ) : null}
            </View>
          ) : (
            <View style={[styles.cardNotice, payment.state.isCompactHeight && styles.cardNoticeCompact]}>
              <Ionicons name="card-outline" size={20} color={Colors.primary} />
              <Text numberOfLines={payment.state.isCompactHeight ? 1 : 2} style={styles.cardNoticeText}>
                Le paiement carte s{"'"}ouvrira dans une page securisée FlexPay.
              </Text>
            </View>
          )}

          <View style={[styles.progressPanel, payment.state.isCompactHeight && styles.progressPanelCompact]}>
            <View style={styles.progressTrack}>
              {payment.presentation.progressSteps.map((step) => {
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
                <View key={step.key} style={styles.progressItem}>
                  <View
                    style={[
                      styles.progressDot,
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
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.progressTitle,
                      step.status !== 'waiting' && { color: Colors.gray[900] },
                    ]}
                  >
                    {step.title}
                  </Text>
                </View>
              );
            })}
            </View>
            {payment.presentation.highlightedProgressStep ? (
              <Text numberOfLines={2} style={styles.progressDescription}>
                {payment.presentation.highlightedProgressStep.description}
              </Text>
            ) : null}
          </View>

          {payment.presentation.statusPanel ? (
            <View
              style={[
                styles.statusPanel,
                payment.state.isCompactHeight && styles.statusPanelCompact,
                { borderColor: payment.presentation.statusPanel.color + '35' },
              ]}
            >
              <View style={[styles.statusIcon, { backgroundColor: payment.presentation.statusPanel.color + '12' }]}>
                {payment.presentation.statusPanel.activity ? (
                  <ActivityIndicator size="small" color={payment.presentation.statusPanel.color} />
                ) : (
                  <Ionicons name={payment.presentation.statusPanel.icon} size={20} color={payment.presentation.statusPanel.color} />
                )}
              </View>
              <View style={styles.statusTextBlock}>
                <Text style={styles.statusTitle}>{payment.presentation.statusPanel.title}</Text>
                <Text numberOfLines={payment.state.isTightHeight ? 1 : 2} style={styles.statusText}>
                  {payment.presentation.statusPanel.text}
                </Text>
                {payment.state.orderNumber ? <Text style={styles.referenceText}>Référence {payment.state.orderNumber}</Text> : null}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(payment.state.insets.bottom, Spacing.md) }]}>
          {payment.state.stage === 'failed' && !payment.state.orderNumber ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={payment.actions.handleRetry}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Changer de moyen</Text>
            </TouchableOpacity>
          ) : null}
          {payment.state.stage === 'waiting_long' && payment.state.orderNumber ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={payment.actions.handleAbandonAndRetry}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Abandonner et réessayer</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={payment.presentation.isPrimaryActionDisabled}
            onPress={payment.actions.handlePrimaryAction}
            style={[styles.primaryButton, payment.presentation.isPrimaryActionDisabled && styles.disabled]}
          >
            {payment.presentation.isBusy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>{payment.presentation.primaryButtonLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}


