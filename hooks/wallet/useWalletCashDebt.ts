import { useDriverFinanceSummaryQuery } from '@/store/api/driverFinanceApi';
import { displayReadOptions, useDisplayReadsEnabled, useDisplayRefetch } from '@/hooks/useDisplayReads';

/** One server-owned debt read, shared by the balance and its existing refresh action. */
export function useWalletCashDebt(userId: string | undefined, isDriver: boolean, active: boolean) {
  const enabled = useDisplayReadsEnabled(Boolean(userId) && isDriver && active);
  const { currentData, isFetching, error, refetch } = useDriverFinanceSummaryQuery(
    userId ?? '', displayReadOptions(enabled),
  );
  const refresh = useDisplayRefetch(enabled, userId ?? 'signed-out', refetch);
  const cash = enabled && !error && !isFetching ? currentData?.cash : undefined;
  const tokens = Number(cash?.debtTokens);
  const amount = Number(cash?.debtAmount ?? tokens * Number(cash?.moneyPerToken));
  return {
    cashDebt: Number.isFinite(tokens) && tokens > 0
      ? { tokens, amount: Number.isFinite(amount) && amount > 0 ? amount : undefined }
      : undefined,
    isFetching: enabled && isFetching,
    refresh,
  };
}
