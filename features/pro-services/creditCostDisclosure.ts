import type { AssetCredit } from '@/store/api/assetCreditApi';

export const CREDIT_COST_VERSION = 'asset-credit-cost-v1';
export function hasValidCostDisclosure(credit: AssetCredit) {
  if (!credit.costDisclosureVersion) return credit.cashPriceMinor == null && credit.creditFeeMinor == null
    && credit.installmentCount == null && credit.installmentPeriod == null;
  if (credit.costDisclosureVersion !== CREDIT_COST_VERSION || credit.cashPriceMinor == null || credit.creditFeeMinor == null) return false;
  const price = Number(credit.cashPriceMinor), fee = Number(credit.creditFeeMinor), total = Number(credit.principalMinor);
  if (![price, fee, total].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 1e12 && v % 10 === 0)
    || price < 100 || price + fee !== total) return false;
  if (credit.installmentCount == null && credit.installmentPeriod == null) return true;
  const count = credit.installmentCount;
  if (!count || !Number.isInteger(count) || count > 120 || count < 1
    || !['week', 'month'].includes(credit.installmentPeriod ?? '') || credit.installments?.length !== count) return false;
  let sum = 0;
  for (const [index, row] of credit.installments.entries()) {
    if (row.ordinal !== index + 1 || !Number.isSafeInteger(row.amountMinor) || row.amountMinor <= 0 || row.amountMinor % 10
      || !Number.isSafeInteger(row.remainingMinor) || row.remainingMinor < 0 || row.remainingMinor > row.amountMinor
      || (row.dueAt !== null && !Number.isFinite(Date.parse(row.dueAt)))) return false;
    sum += row.amountMinor;
  }
  return sum === total && Number.isSafeInteger(credit.minimumDueMinor) && credit.minimumDueMinor! >= 0 && credit.minimumDueMinor! <= total;
}
