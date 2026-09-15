import { WalletSheetModal } from './WalletSheetModal';
import { TOP_UP_METHOD_OPTIONS, normalizePhone } from './walletModel';
import { WalletAction, TopUpStage, AUTO_CHECK_MAX_ATTEMPTS } from './walletTypes';
import { styles } from '../screen-styles/app/wallet/index';
import { Colors } from '@/constants/styles';
import type { SubscriptionPaymentMethod } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface WalletTopUpModalProps {
  setActiveModal: React.Dispatch<React.SetStateAction<WalletAction | null>>;
  activeModal: WalletAction | null;
  topUpMethod: SubscriptionPaymentMethod;
  topUpOrderNumber: string | null;
  isTopUpBusy: boolean;
  setTopUpMethod: React.Dispatch<React.SetStateAction<SubscriptionPaymentMethod>>;
  setTopUpAmount: React.Dispatch<React.SetStateAction<string>>;
  topUpAmount: string;
  isTopUpPhoneRequired: boolean;
  setTopUpPhone: React.Dispatch<React.SetStateAction<string>>;
  topUpPhone: string;
  handleTopUp: () => Promise<void>;
  topUpPaymentUrl: string | null;
  topUpStatusMessage: string | null;
  topUpStatusColor: string;
  isAutoCheckingTopUp: boolean;
  isCheckingTopUp: boolean;
  topUpStage: TopUpStage;
  topUpStatusTitle: string;
  topUpAutoCheckAttempt: number;
  handleCheckTopUpStatus: () => Promise<void>;
}

export function WalletTopUpModal({
  setActiveModal,
  activeModal,
  topUpMethod,
  topUpOrderNumber,
  isTopUpBusy,
  setTopUpMethod,
  setTopUpAmount,
  topUpAmount,
  isTopUpPhoneRequired,
  setTopUpPhone,
  topUpPhone,
  handleTopUp,
  topUpPaymentUrl,
  topUpStatusMessage,
  topUpStatusColor,
  isAutoCheckingTopUp,
  isCheckingTopUp,
  topUpStage,
  topUpStatusTitle,
  topUpAutoCheckAttempt,
  handleCheckTopUpStatus,
}: WalletTopUpModalProps) {
  return (
    <WalletSheetModal
      icon="flash-outline"
      onClose={() => setActiveModal(null)}
      subtitle="Mobile Money ou carte. 1 jeton = 100 FC."
      title="Acheter des jetons"
      visible={activeModal === 'top_up'}
    >
      <View style={styles.methodRow}>
        {TOP_UP_METHOD_OPTIONS.map((option) => {
          const selected = topUpMethod === option.id;
          const disabled = Boolean(topUpOrderNumber) || isTopUpBusy;
          return (
            <TouchableOpacity
              key={option.id}
              activeOpacity={0.85}
              disabled={disabled}
              onPress={() => setTopUpMethod(option.id)}
              style={[
                styles.methodButton,
                selected && styles.methodButtonActive,
                disabled && styles.disabled,
              ]}
            >
              <Ionicons
                name={option.icon}
                size={18}
                color={selected ? Colors.primary : Colors.gray[600]}
              />
              <View style={styles.methodTextBlock}>
                <Text style={styles.methodLabel}>{option.label}</Text>
                <Text numberOfLines={1} style={styles.methodHint}>
                  {option.hint}
                </Text>
              </View>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? Colors.primary : Colors.gray[300]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        keyboardType="numeric"
        onChangeText={setTopUpAmount}
        placeholder="Nombre de jetons"
        placeholderTextColor={Colors.gray[400]}
        style={styles.input}
        value={topUpAmount}
      />
      <Text style={styles.helperText}>1 jeton = 100 FC. Exemple : 50 jetons = 5 000 FC.</Text>
      {isTopUpPhoneRequired ? (
        <TextInput
          keyboardType="phone-pad"
          maxLength={13}
          onChangeText={(text) => setTopUpPhone(normalizePhone(text))}
          placeholder="+243891234567"
          placeholderTextColor={Colors.gray[400]}
          style={styles.input}
          value={topUpPhone}
        />
      ) : null}

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={isTopUpBusy}
        onPress={handleTopUp}
        style={[styles.primaryButton, isTopUpBusy && styles.disabled]}
      >
        {isTopUpBusy ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Ionicons name="flash-outline" size={18} color={Colors.white} />
            <Text style={styles.primaryButtonText}>
              {topUpOrderNumber
                ? topUpMethod === 'card' && topUpPaymentUrl
                  ? 'Rouvrir le paiement'
                  : 'Actualiser la recharge'
                : 'Recharger'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {topUpStatusMessage || topUpOrderNumber ? (
        <View style={[styles.topUpStatusCard, { borderColor: topUpStatusColor + '35' }]}>
          <View style={styles.topUpStatusHeader}>
            {isAutoCheckingTopUp || isCheckingTopUp ? (
              <ActivityIndicator size="small" color={topUpStatusColor} />
            ) : (
              <Ionicons
                name={
                  topUpStage === 'success'
                    ? 'checkmark-circle-outline'
                    : topUpStage === 'failed'
                      ? 'close-circle-outline'
                      : 'sync-outline'
                }
                size={18}
                color={topUpStatusColor}
              />
            )}
            <Text style={[styles.topUpStatusTitle, { color: topUpStatusColor }]}>
              {topUpStatusTitle}
            </Text>
          </View>
          {topUpStatusMessage ? (
            <Text style={styles.topUpStatusText}>{topUpStatusMessage}</Text>
          ) : null}
          {topUpAutoCheckAttempt > 0 ? (
            <Text style={styles.topUpReferenceText}>
              Vérification automatique {topUpAutoCheckAttempt}/{AUTO_CHECK_MAX_ATTEMPTS}
            </Text>
          ) : null}
          {topUpOrderNumber ? (
            <Text style={styles.topUpReferenceText}>Référence FlexPay {topUpOrderNumber}</Text>
          ) : null}
        </View>
      ) : null}

      {topUpOrderNumber ? (
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={isTopUpBusy}
          onPress={handleCheckTopUpStatus}
          style={[styles.secondaryButton, isTopUpBusy && styles.disabled]}
        >
          {isCheckingTopUp || isAutoCheckingTopUp ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <>
              <Ionicons name="sync-outline" size={18} color={Colors.primary} />
              <Text style={styles.secondaryButtonText}>Vérifier la recharge</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </WalletSheetModal>
  );
}
