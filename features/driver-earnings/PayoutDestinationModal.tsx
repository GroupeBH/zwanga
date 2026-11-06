import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { WalletSheetModal } from '@/features/wallet/WalletSheetModal';
import { formatAmount, normalizePayoutPhone, parsePayoutAmount, payoutAmountError } from './payoutModel';
import { styles } from './PayoutDestinationModal.styles';

type Props = {
  visible: boolean;
  amount: string;
  availableBalance: number;
  minimumAmount: number;
  currency: string;
  phone: string;
  defaultPhone?: string | null;
  disabled: boolean;
  onChangePhone: (phone: string) => void;
  onChangeAmount: (amount: string) => void;
  onContinue: () => void;
  onClose: () => void;
};

export function PayoutDestinationModal({
  visible, amount, availableBalance, minimumAmount, currency, phone, defaultPhone, disabled, onChangePhone, onChangeAmount, onContinue, onClose,
}: Props) {
  const normalizedPhone = normalizePayoutPhone(phone);
  const normalizedDefault = normalizePayoutPhone(defaultPhone);
  const amountError = payoutAmountError(amount, availableBalance, minimumAmount, currency);
  const parsed = parsePayoutAmount(amount);
  const canContinue = !disabled && Boolean(normalizedPhone) && !amountError;
  const canTakeAll = !disabled && !payoutAmountError(String(availableBalance), availableBalance, minimumAmount, currency);
  return (
    <WalletSheetModal visible={visible} title="Retirer mes gains" icon="phone-portrait-outline"
      subtitle="Retirez une partie ou tout votre solde." onClose={onClose}>
      <View style={styles.amountBlock}>
        <View style={styles.amountHeading}>
          <Text style={styles.label}>Montant à retirer ({currency})</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canTakeAll, selected: parsed === availableBalance }}
            disabled={!canTakeAll} style={styles.defaultButton} onPress={() => { if (canTakeAll) onChangeAmount(String(availableBalance)); }}>
            <Text style={styles.defaultButtonText}>Tout retirer</Text>
          </TouchableOpacity>
        </View>
        <TextInput accessibilityLabel={`Montant à retirer en ${currency}`} keyboardType="decimal-pad"
          editable={!disabled} value={amount} onChangeText={onChangeAmount} maxLength={20}
          placeholder="0" placeholderTextColor={Colors.gray[400]} selectTextOnFocus
          style={[styles.input, styles.amountInput, amount.trim() && amountError ? styles.invalidInput : null]} />
        <Text style={styles.hint}>Disponible : {formatAmount(availableBalance, currency)} · Minimum : {formatAmount(minimumAmount, currency)}</Text>
        {amount.trim() && amountError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{amountError}</Text> : null}
        {!amountError && parsed !== null && <Text style={styles.remaining} accessibilityLiveRegion="polite">
          Reste disponible : {formatAmount(Math.round((availableBalance - parsed) * 100) / 100, currency)}
        </Text>}
      </View>
      <Text style={styles.label}>Numéro Mobile Money</Text>
      <TextInput accessibilityLabel="Numéro Mobile Money bénéficiaire" keyboardType="phone-pad"
        autoComplete="tel" textContentType="telephoneNumber" autoCorrect={false}
        editable={!disabled} maxLength={24} value={phone} onChangeText={onChangePhone}
        placeholder="0891234567 ou +243891234567" placeholderTextColor={Colors.gray[400]}
        style={[styles.input, phone.trim() && !normalizedPhone ? styles.invalidInput : null]} />
      {phone.trim() && !normalizedPhone ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Entrez un numéro congolais valide, par exemple 0891234567.
        </Text>
      ) : null}
      {normalizedDefault && normalizedPhone !== normalizedDefault ? (
        <TouchableOpacity accessibilityRole="button" disabled={disabled}
          onPress={() => onChangePhone(normalizedDefault)} style={styles.defaultButton}>
          <Text style={styles.defaultButtonText}>Utiliser mon numéro habituel</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.hint}>Vous pouvez utiliser un autre numéro. Votre numéro de profil reste inchangé.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canContinue }}
        disabled={!canContinue} onPress={() => { if (canContinue) onContinue(); }}
        style={[styles.continueButton, !canContinue && styles.disabled]}>
        <Text style={styles.continueText}>Continuer</Text>
      </TouchableOpacity>
    </WalletSheetModal>
  );
}
