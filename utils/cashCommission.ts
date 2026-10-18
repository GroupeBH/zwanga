import type { DriverFinanceSummary } from '@/store/api/driverFinanceApi';

/** Preview only. The server reserves funds atomically when the driver accepts. */
export function estimateCashCommission(finance: DriverFinanceSummary | undefined, price: number, seats = 1) {
  if (!finance || !Number.isFinite(price) || price < 0 || !Number.isInteger(seats) || seats < 1 ||
      !Number.isFinite(finance.cash.moneyPerToken) || finance.cash.moneyPerToken <= 0) return null;
  const rate = finance.cashCommissionRate ?? finance.commissionRate ?? 0.05;
  // Each single-seat passenger is rounded separately; reserve the conservative
  // estimate when the aggregate rounding would require slightly fewer tokens.
  const tokenCost = (amount: number) => Math.round(Math.round(amount * rate * 100) / finance.cash.moneyPerToken) / 100;
  const required = Math.round(Math.max(tokenCost(price * seats), tokenCost(price) * seats) * 100) / 100;
  const available = finance.cash.availableTokens;
  if (!Number.isFinite(required) || !Number.isFinite(available) || available < 0) return null;
  const debt = Math.round(Math.max(0, required - available) * 100) / 100;
  // Older backends must not be assumed to allow credit.
  const existingDebt = finance.cash.debtTokens;
  const limit = finance.cash.debtLimitTokens ?? 25;
  const offeredCredit = finance.cash.availableCreditTokens ?? 0;
  if (![existingDebt, limit, offeredCredit].every(Number.isFinite) || existingDebt < 0 || limit < 0 || offeredCredit < 0) return null;
  const credit = Math.min(offeredCredit, Math.max(0, Math.round((limit - existingDebt) * 100) / 100));
  const totalDebt = Math.round((existingDebt + debt) * 100) / 100;
  return { required, debt, debtAmount: Math.round(debt * finance.cash.moneyPerToken * 100) / 100,
    totalDebt, remainingCredit: credit,
    allowed: finance.cash.enabled && !finance.cash.blocked && existingDebt <= limit && debt <= credit };
}
