import type { FleetAssignment } from "@/store/api/fleetRegistryApi";
import { creditMoney } from "./assetCreditModel";
export const fleetPeriods = {
  DAILY: "jour",
  WEEKLY: "semaine",
  MONTHLY: "mois",
};
export const fleetPaymentStatus = {
  DECLARED: "À confirmer par le propriétaire",
  CONFIRMED: "Reçu par le propriétaire",
  REJECTED: "Refusé par le propriétaire",
};
export function fleetTerms(
  a: Pick<FleetAssignment, "periodicAmountMinor" | "paymentPeriod">,
) {
  return a.periodicAmountMinor && a.paymentPeriod
    ? `${creditMoney(a.periodicAmountMinor)} / ${fleetPeriods[a.paymentPeriod]}`
    : "Aucun montant périodique enregistré";
}
export function fleetPaymentDate(text: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(text) &&
    Number.isFinite(Date.parse(text)) &&
    new Date(text).toISOString().slice(0, 10) === text
  );
}
