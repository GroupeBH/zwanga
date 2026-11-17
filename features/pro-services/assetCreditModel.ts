import type { AssetKind } from '@/store/api/assetCreditApi';

export const creditEquipment: { kind: AssetKind; label: string; hint: string; icon: 'phone-portrait-outline' | 'shield-outline' | 'locate-outline' | 'cube-outline' | 'construct-outline' | 'car-outline' }[] = [
  { kind: 'phone', label: 'Téléphone', hint: 'Modèle ou usage souhaité', icon: 'phone-portrait-outline' },
  { kind: 'helmet', label: 'Casque', hint: 'Taille et type de casque', icon: 'shield-outline' },
  { kind: 'gps_tracker', label: 'Traceur GPS', hint: 'Véhicule à équiper et usage', icon: 'locate-outline' },
  { kind: 'delivery_equipment', label: 'Matériel de livraison', hint: 'Sac, coffre, équipement souhaité…', icon: 'cube-outline' },
  { kind: 'equipment', label: 'Autre équipement', hint: 'Quel équipement vous faut-il ?', icon: 'construct-outline' },
  { kind: 'vehicle', label: 'Véhicule', hint: 'Voiture, moto, modèle et usage…', icon: 'car-outline' },
];
export const creditEquipmentLabel = (kind: string) => creditEquipment.find(item => item.kind === kind)?.label ?? 'Matériel';

export const creditStatus = {
  offered: "Votre accord est requis",
  accepted: "En attente de remise",
  active: "En remboursement",
  settled: "Crédit soldé",
  declined: "Offre refusée",
  cancelled: "Annulé",
};
export const creditMoney = (minor: string | number) =>
  `${(Number(minor) / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} FC`;
/** Match wallet precision (0.01 token = 0.1 CDF); never round a user's amount up. */
export function repaymentMinor(input: string): number | null {
  const text = input.trim().replace(",", ".");
  if (!/^\d+(\.\d)?$/.test(text)) return null;
  const value = Math.round(Number(text) * 100);
  return Number.isSafeInteger(value) && value > 0 && value <= 1e12
    ? value
    : null;
}
export function definitiveRepaymentFailure(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  return (
    typeof status === "number" &&
    [400, 401, 403, 404, 409, 422, 429].includes(status)
  );
}
