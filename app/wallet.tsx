import { useWalletController } from "../hooks/wallet/useWalletController";
import { isDriverAccount } from '@/utils/accountRole';
import { WalletTopUpModal } from "../features/wallet/WalletTopUpModal";
import { WalletTransferModal } from "../features/wallet/WalletTransferModal";
import {
  WalletWithdrawalSection,
  WalletWithdrawalModal,
} from "../features/wallet/WalletWithdrawalSection";
import { useWalletWithdrawal } from "@/hooks/wallet/useWalletWithdrawal";
import { useScreenIsActive } from "@/hooks/useAppIsActive";
import { useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/selectors";
import { WalletOverview, WalletRelatedLinks } from "../features/wallet/WalletOverview";
import { styles } from "../features/screen-styles/app/wallet/index";
import { Colors } from "@/constants/styles";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Stack } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HistoryPagination } from '@/components/ui/HistoryPagination';

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
      <Stack.Screen
        options={
          wallet.activeModal
            ? SHEET_NAVIGATION_OPTIONS
            : WALLET_NAVIGATION_OPTIONS
        }
      />
      <View
        style={styles.scrollRoot}
        pointerEvents={wallet.activeModal ? "none" : "auto"}
        accessibilityElementsHidden={wallet.activeModal !== null}
        importantForAccessibility={
          wallet.activeModal ? "no-hide-descendants" : "auto"
        }
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => wallet.router.back()}
            accessibilityRole="button" accessibilityLabel="Retour"
            style={styles.headerButton}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.gray[900]} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Jetons Zwanga</Text>
          </View>
          <TouchableOpacity
            onPress={wallet.refreshAll}
            accessibilityRole="button" accessibilityLabel="Actualiser les jetons"
            style={styles.headerButton}
          >
            {wallet.isRefreshing ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons
                name="refresh-outline"
                size={20}
                color={Colors.gray[900]}
              />
            )}
          </TouchableOpacity>
        </View>

        <FlatList
          data={wallet.entries}
          keyExtractor={entry => entry.id}
          renderItem={({ item }) => <View style={styles.ledgerPanel}>{wallet.renderLedgerEntry(item)}</View>}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={wallet.isRefreshing}
              onRefresh={wallet.refreshAll}
            />
          }
          showsVerticalScrollIndicator={false}
          style={styles.scrollRoot}
          ListHeaderComponent={<View style={styles.contentHeader}>
          <WalletOverview key={`balance:${user?.id ?? 'signed-out'}`} wallet={wallet} withdrawal={withdrawal} />
          <WalletWithdrawalSection key={`withdrawals:${user?.id ?? 'signed-out'}`} summary={wallet.walletSummary} withdrawal={withdrawal} />

          {wallet.topUpStatusMessage || wallet.topUpOrderNumber ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => wallet.setActiveModal("top_up")}
              style={[
                styles.followUpBanner,
                { borderColor: wallet.topUpStatusColor + "35" },
              ]}
            >
              <View
                style={[
                  styles.followUpIcon,
                  { backgroundColor: wallet.topUpStatusColor + "12" },
                ]}
              >
                {wallet.isAutoCheckingTopUp || wallet.isCheckingTopUp ? (
                  <ActivityIndicator
                    size="small"
                    color={wallet.topUpStatusColor}
                  />
                ) : (
                  <Ionicons
                    name={
                      wallet.topUpStage === "success"
                        ? "checkmark-circle-outline"
                        : wallet.topUpStage === "failed"
                          ? "close-circle-outline"
                          : "sync-outline"
                    }
                    size={18}
                    color={wallet.topUpStatusColor}
                  />
                )}
              </View>
              <View style={styles.followUpCopy}>
                <Text
                  style={[
                    styles.followUpTitle,
                    { color: wallet.topUpStatusColor },
                  ]}
                >
                  {wallet.topUpStatusTitle}
                </Text>
                <Text numberOfLines={2} style={styles.followUpText}>
                  {wallet.topUpStatusMessage ||
                    "Touchez pour suivre la recharge."}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.gray[400]}
              />
            </TouchableOpacity>
          ) : null}

          <WalletRelatedLinks wallet={wallet} isDriver={isDriverAccount(user)} />

          <View style={styles.historyHeader}>
            <Text style={styles.sectionTitle}>Historique</Text>
            {wallet.isLedgerFetching ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : null}
          </View>

          </View>}
          ListEmptyComponent={
              <View style={styles.emptyLedger}>
                <Ionicons
                  name="receipt-outline"
                  size={24}
                  color={Colors.gray[400]}
                />
                <Text style={styles.emptyLedgerText}>
                  {wallet.isLedgerFetching ? 'Chargement de l’historique…' : wallet.isLedgerError
                    ? 'Historique indisponible pour le moment.' : 'Aucun mouvement pour le moment.'}
                </Text>
              </View>
          }
          ListFooterComponent={<>
            {wallet.ledgerPage?.limited && <Text style={styles.balanceHint}>
              Seules les opérations récentes sont disponibles pour le moment.
            </Text>}
            <HistoryPagination page={wallet.ledgerCursor.page} busy={wallet.isLedgerFetching}
              hasNext={Boolean(wallet.ledgerPage?.nextCursor)} error={wallet.isLedgerError}
              onPrevious={wallet.ledgerCursor.previous}
              onNext={() => wallet.ledgerCursor.next(wallet.ledgerPage?.nextCursor)}
              onRetry={() => { void wallet.refetchLedger(); }} />
          </>}
        />
      </View>

      <WalletWithdrawalModal
        summary={wallet.walletSummary}
        withdrawal={withdrawal}
        visible={wallet.activeModal === "withdrawal"}
        onClose={() => wallet.setActiveModal(null)}
      />

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

      <WalletTransferModal wallet={wallet} />
    </SafeAreaView>
  );
}
