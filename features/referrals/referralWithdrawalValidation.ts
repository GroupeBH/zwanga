import type { ReferralSummary } from '@/types';
import { formatNumber } from './referralModel';

export type ReferralWithdrawalValidation =
  | { valid: true; tokens: number }
  | { valid: false; title: string; message: string };

export function validateReferralWithdrawal(text: string, summary?: ReferralSummary): ReferralWithdrawalValidation {
  if (!summary) return { valid: false, title: 'Solde indisponible', message: 'Actualisez votre solde de parrainage avant de demander un retrait.' };
  const input = text.trim().replace(',', '.');
  const tokens = Number(input);
  if (!/^\d+(?:\.\d{1,2})?$/.test(input) || !Number.isFinite(tokens) || tokens <= 0 || !Number.isSafeInteger(Math.round(tokens * 100))) {
    return { valid: false, title: 'Montant invalide', message: 'Entrez un nombre de jetons positif, avec au maximum deux décimales.' };
  }
  const minimum = Number(summary.withdrawal.minimumTokens);
  const available = Number(summary.balances.availableTokens);
  if (!Number.isFinite(minimum) || minimum <= 0 || !Number.isFinite(available) || available < 0) {
    return { valid: false, title: 'Solde indisponible', message: 'Le solde disponible ne peut pas être vérifié. Actualisez la page.' };
  }
  if (tokens < minimum) return { valid: false, title: 'Minimum non atteint', message: `Le retrait minimum est de ${formatNumber(minimum)} jetons de parrainage disponibles.` };
  if (tokens > available) return { valid: false, title: 'Solde disponible insuffisant', message: `Vous pouvez retirer au maximum ${formatNumber(available)} jetons de parrainage disponibles. Les jetons en attente, réservés et du portefeuille ne sont pas utilisables pour ce retrait.` };
  if (!summary.withdrawal.kycApproved) return { valid: false, title: 'Vérification requise', message: 'Vérifiez votre identité avant de retirer vos gains.' };
  if (summary.withdrawal.enabled === false || summary.withdrawal.blocked) return { valid: false, title: 'Retrait indisponible', message: 'Le retrait est actuellement bloqué. Actualisez votre solde ou contactez le support.' };
  return { valid: true, tokens };
}
