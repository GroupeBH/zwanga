import type { WalletSummary } from '@/types';
import type { RideEntryMessage } from '@/services/rideEntryAnnouncement';
import { walletTokenWithdrawalsDisabled, WALLET_TOKEN_USE_ONLY } from './walletPolicy';

const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
function amount(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && Number.isSafeInteger(Math.round(number * 100)) ? number : null;
}
const tokens = (value: number) => `${format.format(value)} ${value === 1 ? 'jeton' : 'jetons'}`;
export type WalletWithdrawalIssue = 'pending' | 'storage' | 'history' | undefined;

/** Read server balances, never infer purchasable/withdrawable money from a bonus. */
export function walletAnnouncement(summary: WalletSummary | undefined, userId: string | undefined,
  issue?: WalletWithdrawalIssue): RideEntryMessage | null {
  if (!userId || summary?.account?.userId !== userId || summary.account.currency !== 'PTS') return null;
  const { account, withdrawal } = summary;
  const balance = amount(account.balance);
  const commission = amount(account.reservedCashCommissionBalance ?? 0);
  if (balance === null || commission === null || commission > balance) return null;
  const available = balance - commission;
  const parts = [`Vous avez ${tokens(available)} ${available === 1 ? 'disponible' : 'disponibles'} pour payer.`];
  const purchased = amount(account.withdrawableBalance);
  const nonWithdrawable = amount(withdrawal?.nonWithdrawableTokens);
  const withdrawable = purchased === null ? null : Math.min(purchased, available);
  if (walletTokenWithdrawalsDisabled(summary)) {
    parts.push(WALLET_TOKEN_USE_ONLY);
    parts.push('Les gains de trajets et de parrainage ont des conditions de retrait séparées.');
    if (issue === 'pending') parts.push('Un ancien retrait reste à vérifier. Ne le demandez pas deux fois.');
    else if (issue === 'storage') parts.push('Contactez l’assistance pour vérifier votre ancien retrait.');
  } else if (!withdrawal || withdrawable === null || nonWithdrawable === null || nonWithdrawable > balance ||
      (purchased !== null && purchased > balance) || withdrawable + nonWithdrawable > balance + 0.005) {
    parts.push('La part retirable est indisponible. Actualisez avant un retrait.');
  } else {
    const money = amount(withdrawal.availableMoney);
    const currency = String(withdrawal.currency ?? '').toUpperCase();
    const unit = currency === 'CDF' || currency === 'FC' ? 'francs congolais' : currency === 'USD' ? 'dollars' : null;
    parts.push(withdrawable === 0 ? 'Aucun jeton n’est convertible en argent.' :
      `${tokens(withdrawable)} ${withdrawable === 1 ? 'est convertible' : 'sont convertibles'} en argent${money !== null && money > 0 && unit ? `, soit ${format.format(money)} ${unit}` : ''}.`);
    if (nonWithdrawable > 0) parts.push(`${tokens(nonWithdrawable)} ${nonWithdrawable === 1 ? 'sert' : 'servent'} uniquement à payer, sans retrait possible.`);
    if (account.withdrawalsBlocked || withdrawal.blocked) parts.push('Retraits bloqués : contactez l’assistance.');
    else if (!withdrawal.enabled) parts.push('Les retraits sont temporairement indisponibles.');
    else if (issue === 'storage') parts.push('Votre retrait est à vérifier avec l’assistance avant de recommencer.');
    else if (issue === 'pending') parts.push('Un retrait reste à vérifier. Ne le demandez pas deux fois.');
    else if (issue === 'history') parts.push('Actualisez les retraits avant toute nouvelle demande.');
    else if (withdrawable > 0) {
      const minimum = amount(withdrawal.minimumTokens);
      parts.push(minimum !== null && withdrawable < minimum ?
        `Le retrait demande au moins ${tokens(minimum)}.` : 'Le retrait exige une identité vérifiée.');
    }
  }
  if (commission > 0) parts.push(`${tokens(commission)} ${commission === 1 ? 'est réservé' : 'sont réservés'} aux commissions cash.`);
  const reserved = amount(account.reservedWithdrawalBalance);
  if (reserved !== null && reserved > 0) parts.push(`${tokens(reserved)} ${reserved === 1 ? 'est déjà engagé' : 'sont déjà engagés'} dans des retraits.`);
  if (!commission && !reserved) parts.push('Les bonus de fidélité ne sont pas retirables.');
  const text = parts.join(' ');
  // Exclude update timestamps and history rows: polling must not repeat speech.
  return { key: `wallet:${account.id}:${text}`, text };
}
