import { useWalletController } from '../hooks/wallet/useWalletController';
import { WalletTopUpModal } from '../features/wallet/WalletTopUpModal';
import { WalletSheetModal } from '../features/wallet/WalletSheetModal';
import { WalletWithdrawalSection, WalletWithdrawalModal } from '../features/wallet/WalletWithdrawalSection';
import { useWalletWithdrawal } from '@/hooks/wallet/useWalletWithdrawal';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { formatWalletAmount } from '../features/wallet/walletModel';
import { styles } from '../features/screen-styles/app/wallet/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

const WALLET_NAVIGATION_OPTIONS = { gestureEnabled: true };
const SHEET_NAVIGATION_OPTIONS = { gestureEnabled: false };

export default function WalletScreen() {
  const wallet = useWalletController();
  const user = useAppSelector(selectUser);
  const screenActive = useScreenIsActive();
  const withdrawal = useWalletWithdrawal(wallet.walletSummary, screenActive);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={wallet.activeModal ? SHEET_NAVIGATION_OPTIONS : WALLET_NAVIGATION_OPTIONS} />
      <View style={styles.scrollRoot} pointerEvents={wallet.activeModal ? 'none' : 'auto'}
        accessibilityElementsHidden={wallet.activeModal !== null}
        importantForAccessibility={wallet.activeModal ? 'no-hide-descendants' : 'auto'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => wallet.router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Jetons Zwanga</Text>
          <Text style={styles.headerSubtitle}>Acheter, utiliser, partager et retirer</Text>
        </View>
        <TouchableOpacity onPress={wallet.refreshAll} style={styles.headerButton}>
          {wallet.isRefreshing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Ionicons name="refresh-outline" size={20} color={Colors.gray[900]} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={wallet.isRefreshing} onRefresh={wallet.refreshAll} />}
        showsVerticalScrollIndicator={false}
        style={styles.scrollRoot}
      >
        <View style={styles.balancePanel}>
          <View style={styles.balanceTopRow}>
            <View style={styles.balanceIcon}>
              <Ionicons name="wallet-outline" size={22} color={Colors.white} />
            </View>
            <Text style={styles.balanceLabel}>Solde disponible</Text>
          </View>
          {wallet.isWalletLoading ? (
            <ActivityIndicator color={Colors.primary} style={styles.balanceLoader} />
          ) : (
            <Text style={styles.balanceValue}>
              {formatWalletAmount(wallet.walletSummary?.account.balance ?? 0, wallet.currency)}
            </Text>
          )}
          <Text style={styles.balanceHint}>
            Les jetons achetés sont retirables en argent. Les jetons de fidélité ne sont pas retirables : ils sont utilisés en premier pour payer vos trajets et abonnements.
          </Text>
          {wallet.walletSummary?.withdrawal ? <>
            <Text style={styles.balanceLabel}>Achetés, y compris reçus par transfert : {formatWalletAmount(wallet.walletSummary.account.withdrawableBalance)}</Text>
            <Text style={styles.balanceHint}>Non retirables (fidélité, bonus et autres crédits non éligibles) : {formatWalletAmount(wallet.walletSummary.withdrawal.nonWithdrawableTokens)}</Text>
            <Text style={styles.balanceHint}>Réservés pour des retraits en cours : {formatWalletAmount(wallet.walletSummary.account.reservedWithdrawalBalance)}</Text>
          </> : null}
        </View>

        <TouchableOpacity style={styles.referralBanner} onPress={() => wallet.router.push('/referrals')}>
          <View style={styles.referralBannerIcon}>
            <Ionicons name="gift-outline" size={21} color={Colors.primary} />
          </View>
          <View style={styles.referralBannerText}>
            <Text style={styles.referralBannerTitle}>Jetons de parrainage</Text>
            <Text style={styles.referralBannerHint}>Retirez vos récompenses de parrainage et les commissions de vos filleuls.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
        </TouchableOpacity>

        {user?.isDriver || user?.role === 'driver' ? <TouchableOpacity style={styles.referralBanner} onPress={() => wallet.router.push('/driver-earnings')}>
          <Ionicons name="car-outline" size={22} color={Colors.primary} />
          <View style={styles.referralBannerText}>
            <Text style={styles.referralBannerTitle}>Mes revenus conducteur</Text>
            <Text style={styles.referralBannerHint}>Consultez les revenus de vos trajets et retirez le solde disponible.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
        </TouchableOpacity> : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Recharger des jetons"
            activeOpacity={0.85}
            onPress={() => wallet.setActiveModal('top_up')}
            style={styles.actionCard}
          >
            <View style={styles.actionCardIcon}>
              <Ionicons name="add-circle-outline" size={22} color={Colors.white} />
            </View>
            <Text style={styles.actionCardTitle}>Recharger</Text>
            <Text style={styles.actionCardHint}>Acheter des jetons</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Partager des jetons"
            activeOpacity={0.85}
            onPress={() => wallet.setActiveModal('transfer')}
            style={styles.actionCard}
          >
            <View style={[styles.actionCardIcon, styles.actionCardIconSecondary]}>
              <Ionicons name="share-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.actionCardTitle}>Partager</Text>
            <Text style={styles.actionCardHint}>Envoyer à un utilisateur</Text>
          </TouchableOpacity>
        </View>

        <WalletWithdrawalSection summary={wallet.walletSummary} withdrawal={withdrawal}
          onOpen={() => wallet.setActiveModal('withdrawal')} />

        {wallet.topUpStatusMessage || wallet.topUpOrderNumber ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => wallet.setActiveModal('top_up')}
            style={[styles.followUpBanner, { borderColor: wallet.topUpStatusColor + '35' }]}
          >
            <View style={[styles.followUpIcon, { backgroundColor: wallet.topUpStatusColor + '12' }]}>
              {wallet.isAutoCheckingTopUp || wallet.isCheckingTopUp ? (
                <ActivityIndicator size="small" color={wallet.topUpStatusColor} />
              ) : (
                <Ionicons
                  name={
                    wallet.topUpStage === 'success'
                      ? 'checkmark-circle-outline'
                      : wallet.topUpStage === 'failed'
                        ? 'close-circle-outline'
                        : 'sync-outline'
                  }
                  size={18}
                  color={wallet.topUpStatusColor}
                />
              )}
            </View>
            <View style={styles.followUpCopy}>
              <Text style={[styles.followUpTitle, { color: wallet.topUpStatusColor }]}>{wallet.topUpStatusTitle}</Text>
              <Text numberOfLines={2} style={styles.followUpText}>
                {wallet.topUpStatusMessage || 'Touchez pour suivre la recharge.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Historique</Text>
          {wallet.isLedgerFetching ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
        </View>

        <View style={styles.ledgerPanel}>
          {wallet.entries.length > 0 ? (
            wallet.entries.map(wallet.renderLedgerEntry)
          ) : (
            <View style={styles.emptyLedger}>
              <Ionicons name="receipt-outline" size={24} color={Colors.gray[400]} />
              <Text style={styles.emptyLedgerText}>Aucun mouvement pour le moment.</Text>
            </View>
          )}
        </View>
      </ScrollView>
      </View>

      <WalletWithdrawalModal summary={wallet.walletSummary} withdrawal={withdrawal}
        visible={wallet.activeModal === 'withdrawal'} onClose={() => wallet.setActiveModal(null)} />

      <WalletTopUpModal
        setActiveModal={wallet.setActiveModal}
        activeModal={wallet.activeModal}
        topUpMethod={wallet.topUpMethod}
        topUpOrderNumber={wallet.topUpOrderNumber}
        isTopUpBusy={wallet.isTopUpBusy}
        setTopUpMethod={wallet.setTopUpMethod}
        setTopUpAmount={wallet.setTopUpAmount}
        topUpAmount={wallet.topUpAmount}
        isTopUpPhoneRequired={wallet.isTopUpPhoneRequired}
        setTopUpPhone={wallet.setTopUpPhone}
        topUpPhone={wallet.topUpPhone}
        handleTopUp={wallet.handleTopUp}
        topUpPaymentUrl={wallet.topUpPaymentUrl}
        topUpStatusMessage={wallet.topUpStatusMessage}
        topUpStatusColor={wallet.topUpStatusColor}
        isAutoCheckingTopUp={wallet.isAutoCheckingTopUp}
        isCheckingTopUp={wallet.isCheckingTopUp}
        topUpStage={wallet.topUpStage}
        topUpStatusTitle={wallet.topUpStatusTitle}
        topUpAutoCheckAttempt={wallet.topUpAutoCheckAttempt}
        handleCheckTopUpStatus={wallet.handleCheckTopUpStatus}
      />

      <WalletSheetModal
        icon="share-outline"
        onClose={() => wallet.setActiveModal(null)}
        subtitle="Les jetons de fidélité sont transférés en premier et restent non retirables. Les jetons achetés restent retirables chez le destinataire."
        title="Partager des jetons"
        visible={wallet.activeModal === 'transfer'}
      >
        <TextInput
          keyboardType="numeric"
          accessibilityLabel="Nombre de jetons à partager"
          onChangeText={wallet.setTransferAmount}
          placeholder="Nombre de jetons"
          placeholderTextColor={Colors.gray[400]}
          style={styles.input}
          value={wallet.transferAmount}
        />
        <TextInput
          autoCapitalize="none"
          keyboardType="default"
          accessibilityLabel="Destinataire du partage"
          onChangeText={wallet.setTransferRecipient}
          placeholder="Téléphone, email ou ID utilisateur"
          placeholderTextColor={Colors.gray[400]}
          style={styles.input}
          value={wallet.transferRecipient}
        />
        <TextInput
          accessibilityLabel="Note optionnelle du partage"
          onChangeText={wallet.setTransferNote}
          placeholder="Note optionnelle"
          placeholderTextColor={Colors.gray[400]}
          style={styles.input}
          value={wallet.transferNote}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={wallet.isTransferring}
          onPress={wallet.handleTransfer}
          style={[styles.primaryButton, wallet.isTransferring && styles.disabled]}
        >
          {wallet.isTransferring ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="send-outline" size={18} color={Colors.white} />
              <Text style={styles.primaryButtonText}>Partager les jetons</Text>
            </>
          )}
        </TouchableOpacity>
      </WalletSheetModal>
    </SafeAreaView>
  );
}
