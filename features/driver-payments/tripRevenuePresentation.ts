type RevenuePayload = {
  ledgerVerified?: unknown;
  confirmedAmount?: unknown;
  creditPendingAmount?: unknown;
  cashToCollectAmount?: unknown;
  electronicPendingAmount?: unknown;
  totalExpectedAmount?: unknown;
  currency?: unknown;
};

export type TripRevenueRow = {
  key: 'confirmed' | 'unverified' | 'creditPending' | 'cash' | 'electronicPending';
  amount: number;
  label: string;
  hint: string;
  icon: 'wallet-outline' | 'time-outline' | 'cash-outline';
  tone: 'success' | 'warning' | 'info';
};

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Safe for REST, Socket.IO and string-valued push payloads, including older servers. */
export function getTripRevenueRows(summary: RevenuePayload): TripRevenueRow[] {
  const rows: TripRevenueRow[] = [];
  const confirmed = amount(summary.confirmedAmount);
  if (confirmed > 0) {
    const verified = summary.ledgerVerified === true || summary.ledgerVerified === 'true';
    rows.push({
      key: verified ? 'confirmed' : 'unverified', amount: confirmed,
      label: verified ? 'Gains crédités' : 'Gain à vérifier',
      hint: verified ? 'Retrouvez le détail dans Revenus.' : 'Vérifiez son enregistrement dans Revenus.',
      icon: 'wallet-outline', tone: verified ? 'success' : 'info',
    });
  }
  const pending = amount(summary.creditPendingAmount);
  if (pending > 0) rows.push({
    key: 'creditPending', amount: pending, label: 'Crédit en attente',
    hint: 'Ce montant n’est pas encore ajouté à vos gains.', icon: 'time-outline', tone: 'info',
  });
  const cash = amount(summary.cashToCollectAmount);
  if (cash > 0) rows.push({
    key: 'cash', amount: cash, label: 'À recevoir en cash',
    hint: 'Directement du passager.', icon: 'cash-outline', tone: 'warning',
  });
  const electronic = amount(summary.electronicPendingAmount);
  if (electronic > 0) rows.push({
    key: 'electronicPending', amount: electronic, label: 'Paiement électronique attendu',
    hint: 'Le paiement n’est pas encore confirmé.', icon: 'time-outline', tone: 'info',
  });
  return rows;
}

export function getTripRevenueMessage(summary: RevenuePayload) {
  const currency = typeof summary.currency === 'string' ? summary.currency : 'CDF';
  const lines = getTripRevenueRows(summary).map(row =>
    `${row.label} : ${row.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`,
  );
  const total = amount(summary.totalExpectedAmount);
  if (total > 0) lines.unshift(`Total attendu : ${total.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`);
  return lines.join('\n') || 'Consultez Revenus pour vérifier le bilan de ce trajet.';
}
