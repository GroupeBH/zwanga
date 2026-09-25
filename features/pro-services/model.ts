import type { ServiceStatus } from "@/types/proServices";
export const serviceNames = {
  documents: "Démarches administratives",
  vehicles: "Financement de véhicule",
  equipment: "Équipements professionnels",
  fleet: "Gestion de flotte",
};
export const statusNames: Record<ServiceStatus, string> = {
  submitted: "Demande reçue",
  reviewing: "En étude",
  needs_info: "Informations à compléter",
  quoted: "Devis proposé",
  accepted: "Devis accepté",
  processing: "Démarches en cours",
  ready: "Prêt à remettre",
  completed: "Démarches terminées",
  rejected: "Non retenu",
  cancelled: "Annulé",
};
export const documentStates = {
  expected: "Garde prévue au contrat",
  held: "Original conservé",
  release_ready: "À vous restituer",
  returned: "Original restitué",
};
export const proAmount = (minor: number, currency = "CDF") =>
  `${(minor / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${currency}`;
export function proError(error: unknown) {
  const data = (error as { data?: { message?: unknown } })?.data;
  if (typeof data?.message === "string") return data.message;
  if (Array.isArray(data?.message)) return data.message.join("\n");
  return "Impossible de joindre le service. Réessayez sans créer une nouvelle demande.";
}
