import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCreateProCaseMutation, useUpdateDocumentCaseMutation } from "@/store/api/proServicesApi";
import type {
  ProApplication,
  ProOffering,
  ServiceCode,
  ProCase,
} from "@/types/proServices";
import { proError } from "./model";
import {
  applicationSnapshot,
  validateProStep,
  type FormErrors,
  type FormStep,
} from "./proServiceFormModel";

type Submission = {
  serviceCode: ServiceCode;
  submissionKey: string;
  contactConsent: true;
  application: ProApplication;
};

export function useProServiceForm(
  offering: ProOffering,
  initial: { fullName: string; phone: string },
  existing?: Pick<ProCase, 'id' | 'application' | 'updatedAt' | 'editMode'>,
) {
  const [form, setForm] = useState<ProApplication>(() => existing ? applicationSnapshot(existing.application) : ({
    ...initial,
    vehicleDescription: "",
    plate: "",
    documents: [],
    description: "",
  }));
  const [step, setStep] = useState<FormStep>(0);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const [create, mutation] = useCreateProCaseMutation();
  const [update, updating] = useUpdateDocumentCaseMutation();
  const pending = useRef<Submission | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = mutation.isLoading || updating.isLoading;
  const additionsOnly = existing?.editMode === 'add_documents';
  const fixedDocuments = additionsOnly ? existing.application.documents : [];
  const locked = busy || uncertain || !!sent || mustReload || alreadyExists;
  const change = <K extends keyof ProApplication>(
    key: K,
    value: ProApplication[K],
  ) => {
    if (locked || inFlight.current) return;
    if (additionsOnly && (key !== 'documents' || fixedDocuments.some(code => !(value as string[]).includes(code)))) return;
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
    setMessage("");
    // The contact consent belongs to the reviewed information, not an earlier draft.
    setConsent(false);
  };
  const goTo = useCallback(
    (next: FormStep) => {
      if (locked || inFlight.current) return;
      setStep(next);
      setMessage("");
      setErrors({});
    },
    [locked],
  );
  const next = () => {
    if (locked || inFlight.current || step === 2) return;
    const invalid = validateProStep(form, offering, step, consent);
    setErrors(invalid);
    if (!Object.keys(invalid).length) setStep((step + 1) as FormStep);
  };
  const toggleConsent = () => {
    if (locked || inFlight.current) return;
    setConsent((previous) => !previous);
    setErrors((previous) => ({ ...previous, consent: undefined }));
  };
  const submit = async () => {
    if (inFlight.current || busy || sent || mustReload || alreadyExists || step !== 2) return;
    // An uncertain attempt must replay the exact payload/key, even if the catalogue changed.
    if (!pending.current) {
      if (!existing && offering.availability !== "open") {
        setMessage(
          "Les nouvelles demandes sont temporairement indisponibles pour ce service.",
        );
        return;
      }
      const invalid = validateProStep(form, offering, 2, consent);
      if (additionsOnly && !form.documents.some(code => !fixedDocuments.includes(code)))
        invalid.documents = 'Choisissez un nouveau document à ajouter.';
      setErrors(invalid);
      if (Object.keys(invalid).length) {
        if (invalid.documents || invalid.description) setStep(0);
        else if (invalid.fullName || invalid.phone) setStep(1);
        return;
      }
    }
    inFlight.current = true;
    setMessage("");
    try {
      pending.current ??= {
        serviceCode: offering.code,
        submissionKey: randomUUID(),
        contactConsent: true,
        application: applicationSnapshot(form),
      };
      const response = existing
        ? await update({ id: existing.id, expectedUpdatedAt: existing.updatedAt,
            mutationId: pending.current.submissionKey, contactConsent: true,
            application: pending.current.application }).unwrap()
        : await create(pending.current).unwrap();
      if (!mounted.current) return;
      setSent(response.id);
      setUncertain(false);
    } catch (error) {
      if (!mounted.current) return;
      const status = (error as { status?: number | string })?.status;
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code === 'DOCUMENT_REQUEST_ALREADY_EXISTS') setAlreadyExists(true);
      if (code === 'DOCUMENT_REQUEST_CHANGED' || code === 'DOCUMENT_REQUEST_NOT_EDITABLE') setMustReload(true);
      const definitive =
        !uncertain &&
        typeof status === "number" &&
        status >= 400 &&
        status < 500;
      // A later 429/401 cannot rule out that a previously timed-out attempt was saved.
      if (definitive) pending.current = null;
      setUncertain(!!pending.current && !definitive);
      setMessage(proError(error));
    } finally {
      inFlight.current = false;
    }
  };
  return {
    form,
    step,
    consent,
    errors,
    message,
    sent,
    uncertain,
    mustReload,
    alreadyExists,
    additionsOnly,
    fixedDocuments,
    locked,
    busy,
    change,
    goTo,
    next,
    toggleConsent,
    submit,
  };
}
