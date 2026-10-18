import React from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { styles } from '@/features/screen-styles/app/wallet';
import type { useWalletController } from '@/hooks/wallet/useWalletController';
import { WalletSheetModal } from './WalletSheetModal';

type Props = { wallet: ReturnType<typeof useWalletController> };
export function WalletTransferModal({ wallet }: Props) {
  return <WalletSheetModal icon="share-outline" onClose={() => wallet.setActiveModal(null)}
    subtitle="Choisissez un montant et un destinataire."
    title="Partager des jetons" visible={wallet.activeModal === 'transfer'}>
    <TextInput keyboardType="numeric" accessibilityLabel="Nombre de jetons à partager"
      onChangeText={wallet.setTransferAmount} placeholder="Nombre de jetons"
      placeholderTextColor={Colors.gray[400]} style={styles.input} value={wallet.transferAmount} />
    <TextInput autoCapitalize="none" keyboardType="default" accessibilityLabel="Destinataire du partage"
      onChangeText={wallet.setTransferRecipient} placeholder="Téléphone, email ou ID utilisateur"
      placeholderTextColor={Colors.gray[400]} style={styles.input} value={wallet.transferRecipient} />
    <TextInput accessibilityLabel="Note optionnelle du partage" onChangeText={wallet.setTransferNote}
      placeholder="Note optionnelle" placeholderTextColor={Colors.gray[400]} style={styles.input} value={wallet.transferNote} />
    <Text style={styles.helperText}>Fidélité partagée en premier, non retirable. Les jetons achetés restent retirables par le destinataire.</Text>
    <TouchableOpacity activeOpacity={0.85} disabled={wallet.isTransferring} onPress={wallet.handleTransfer}
      style={[styles.primaryButton, wallet.isTransferring && styles.disabled]}>
      {wallet.isTransferring ? <ActivityIndicator color={Colors.white} /> : <>
        <Ionicons name="send-outline" size={18} color={Colors.white} />
        <Text style={styles.primaryButtonText}>Partager les jetons</Text>
      </>}
    </TouchableOpacity>
  </WalletSheetModal>;
}
