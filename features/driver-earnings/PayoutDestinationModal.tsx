import React from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';
import { WalletSheetModal } from '@/features/wallet/WalletSheetModal';
import { formatAmount, normalizePayoutPhone } from './payoutModel';
import { styles } from './PayoutDestinationModal.styles';

type Props = {
  visible: boolean;
  amount: number;
  currency: string;
  phone: string;
  defaultPhone?: string | null;
  disabled: boolean;
  onChangePhone: (phone: string) => void;
  onContinue: () => void;
  onClose: () => void;
};

export function PayoutDestinationModal({
  visible, amount, currency, phone, defaultPhone, disabled, onChangePhone, onContinue, onClose,
}: Props) {
  const normalizedPhone = normalizePayoutPhone(phone);
  const normalizedDefault = normalizePayoutPhone(defaultPhone);
  const canContinue = !disabled && Boolean(normalizedPhone);
  return (
    <WalletSheetModal visible={visible} title="Recevoir mes gains" icon="phone-portrait-outline"
      subtitle="Choisissez le numéro qui recevra ce versement." onClose={onClose}>
      <View style={styles.amountBlock}>
        <Text style={styles.amountLabel}>Montant à recevoir</Text>
        <Text style={styles.amount}>{formatAmount(amount, currency)}</Text>
      </View>
      <Text style={styles.label}>Numéro Mobile Money</Text>
      <Text style={styles.hint}>
        Si votre numéro habituel est indisponible, indiquez un autre numéro avec un compte Mobile Money actif.
      </Text>
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
      <Text style={styles.hint}>Ce choix concerne uniquement ce versement. Votre numéro de profil reste inchangé.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canContinue }}
        disabled={!canContinue} onPress={() => { if (canContinue) onContinue(); }}
        style={[styles.continueButton, !canContinue && styles.disabled]}>
        <Text style={styles.continueText}>Vérifier et continuer</Text>
      </TouchableOpacity>
    </WalletSheetModal>
  );
}
