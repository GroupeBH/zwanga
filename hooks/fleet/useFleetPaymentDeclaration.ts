import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { useWalletScreenScope } from "@/hooks/wallet/useWalletScreenScope";
import {
  useDeclareFleetPaymentMutation,
  type FleetPaymentIntent,
} from "@/store/api/fleetPaymentsApi";
import { definitiveRepaymentFailure } from "@/features/pro-services/assetCreditModel";
import { fleetPaymentDate } from "@/features/pro-services/fleetPaymentModel";
import { proError } from "@/features/pro-services/model";
type Declaration = Omit<FleetPaymentIntent, "mutationId">;
export function validFleetDeclaration(value: Declaration) {
  return (
    Number.isSafeInteger(value.amountMinor) &&
    value.amountMinor >= 100 &&
    value.amountMinor <= 1e12 &&
    value.amountMinor % 100 === 0 &&
    fleetPaymentDate(value.paidOn) &&
    typeof value.reference === "string" &&
    value.reference.trim().length >= 3 &&
    value.reference.length <= 160 &&
    typeof value.periodLabel === "string" &&
    value.periodLabel.trim().length >= 3 &&
    value.periodLabel.length <= 100
  );
}
export function useFleetPaymentDeclaration(
  userId: string | undefined,
  id: string,
  active: boolean,
) {
  const captureScope = useWalletScreenScope(
    userId ? `${userId}:${id}` : undefined,
    active,
  );
  const key = `fleet-payment-intent:${userId}:${id}`;
  const [intent, setIntent] = useState<FleetPaymentIntent | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [declare] = useDeclareFleetPaymentMutation();
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setIntent(null);
    setMessage("");
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!mounted) return;
        const saved = raw ? JSON.parse(raw) : null;
        if (
          saved &&
          (!validFleetDeclaration(saved) ||
            !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
              saved.mutationId,
            ))
        )
          throw Error("Invalid intent");
        setIntent(saved);
        setReady(true);
      })
      .catch(() => {
        if (mounted)
          setMessage(
            "Impossible de retrouver le dernier envoi. Fermez puis rouvrez cet écran.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [key]);
  const submit = async (draft: Declaration): Promise<boolean> => {
    const current = captureScope();
    if (
      !current() ||
      !ready ||
      lock.current ||
      (!intent && !validFleetDeclaration(draft))
    )
      return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const operation = intent ?? {
      ...draft,
      reference: draft.reference.trim(),
      periodLabel: draft.periodLabel.trim(),
      mutationId: randomUUID(),
    };
    try {
      await AsyncStorage.setItem(key, JSON.stringify(operation));
      if (!current()) return false;
      setIntent(operation);
      const result = await declare({ id, ...operation }).unwrap();
      if (!current()) return false;
      await AsyncStorage.removeItem(key);
      if (!current()) return false;
      setIntent(null);
      setMessage(
        result.status === "CONFIRMED"
          ? "Le propriétaire a confirmé la réception."
          : result.status === "REJECTED"
            ? "Ce versement a été refusé. Consultez le motif dans l’historique."
            : "Déclaration envoyée. La réception reste à confirmer par le propriétaire.",
      );
      return true;
    } catch (e) {
      if (!current()) return false;
      if (definitiveRepaymentFailure(e)) {
        try {
          await AsyncStorage.removeItem(key);
          if (!current()) return false;
          setIntent(null);
        } catch {
          /* Keep the same operation for a safe retry. */
        }
      }
      setMessage(proError(e));
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { intent, ready, busy, message, submit };
}
