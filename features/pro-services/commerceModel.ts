export const commerceMoney = (value: string) => `${(Number(value) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} FC`;
export function commerceAmount(value: string): string | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d)?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return amount > 0n && amount <= 1000000000000n ? amount.toString() : null;
}
export const commerceStatus: Record<string, string> = { submitted: 'Dossier envoyé', offered: 'Contrat à lire', accepted: 'En attente de remise', active: 'En cours', settled: 'Soldé', closed: 'Dossier fermé', delivered: 'Remis', pending: 'À remettre', processing: 'En préparation', returned: 'Retourné', rejected: 'Refusé' };
