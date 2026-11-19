import type { AssetCredit } from '@/store/api/assetCreditApi';

/** Never invent an expiry date or a repayment schedule. */
export function creditDashboard(items: AssetCredit[], now = Date.now()) {
  const active = items.filter(c => c.status === 'active');
  const offered = items.find(c => c.status === 'offered');
  const remaining = active.reduce((sum, c) => {
    const amount = Number(c.principalMinor) - Number(c.paidMinor);
    return sum + (Number.isSafeInteger(amount) ? Math.max(0, amount) : 0);
  }, 0);
  const scheduled = active.filter(c => creditNextInstallment(c)).sort((a, b) =>
    Date.parse(creditNextInstallment(a)!.dueAt!) - Date.parse(creditNextInstallment(b)!.dueAt!));
  const urgent = scheduled.find(c => Date.parse(creditNextInstallment(c)!.dueAt!) <= now + 7 * 24 * 60 * 60_000);
  // An older server may omit schedules: keep repayments visible, without inventing dates.
  const unknown = active.find(c => !c.installments && c.nextInstallment === undefined);
  return { active, offered, remaining, focus: urgent ?? unknown ?? offered ?? scheduled[0] ?? active[0] };
}
export function creditNextInstallment(credit?: AssetCredit) {
  if (!credit || credit.status !== 'active') return undefined;
  if (credit.nextInstallment?.remainingMinor && credit.nextInstallment.remainingMinor > 0 &&
      credit.nextInstallment.dueAt && Number.isFinite(Date.parse(credit.nextInstallment.dueAt))) return credit.nextInstallment;
  return credit.installments?.filter(row => row.remainingMinor > 0 && row.dueAt && Number.isFinite(Date.parse(row.dueAt)))
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))[0];
}
export function serviceMatches(query: string, text: string) {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return normalize(text).includes(normalize(query));
}
