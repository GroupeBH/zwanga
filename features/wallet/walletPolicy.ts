import type { WalletSummary } from '@/types';

/** Server policy differs from a temporary outage or an account-specific hold. */
export const walletTokenWithdrawalsDisabled = (summary?: WalletSummary) =>
  summary?.withdrawal?.enabled === false &&
  summary.withdrawal.disabledReason?.code === 'TOKEN_WITHDRAWALS_DISABLED';

export const WALLET_TOKEN_USE_ONLY = 'Ces jetons servent à payer dans Zwanga. Ils ne peuvent pas être retirés en argent.';
