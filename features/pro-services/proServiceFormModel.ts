import type { ProApplication, ProOffering } from "@/types/proServices";

export type FormStep = 0 | 1 | 2;
export type FormErrors = Partial<
  Record<keyof ProApplication | "consent", string>
>;
export const formSteps = [
  "Votre besoin",
  "Coordonnées",
  "Vérification",
] as const;

export function validateProStep(
  form: ProApplication,
  offering: ProOffering,
  step: FormStep,
  consent: boolean,
): FormErrors {
  const errors: FormErrors = {};
  if (step === 0 || step === 2) {
    if (offering.code === "documents" && !form.documents.length)
      errors.documents = "Choisissez au moins un document.";
    if (
      form.documents.some(
        (code) => !offering.documentOptions.some((doc) => doc.code === code),
      )
    )
      errors.documents =
        "Cette sélection a changé. Choisissez à nouveau vos documents.";
    if (offering.code !== "documents" && form.description.trim().length < 10)
      errors.description =
        "Décrivez votre besoin en quelques mots (10 caractères minimum).";
  }
  if (step === 1 || step === 2) {
    if (form.fullName.trim().length < 3)
      errors.fullName = "Indiquez votre nom complet (3 caractères minimum).";
    if (
      !/^\+?[\d ()-]{8,20}$/.test(form.phone.trim()) ||
      form.phone.replace(/\D/g, "").length < 8
    )
      errors.phone = "Indiquez un numéro valide sur lequel vous joindre.";
  }
  if (step === 2 && !consent)
    errors.consent =
      "Autorisez l’équipe à vous contacter pour envoyer la demande.";
  return errors;
}

export function applicationSnapshot(form: ProApplication): ProApplication {
  return {
    fullName: form.fullName.trim(),
    phone: form.phone.trim(),
    vehicleDescription: form.vehicleDescription.trim(),
    plate: form.plate?.trim() ?? "",
    documents: [...form.documents],
    description: form.description.trim(),
  };
}
