import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ServiceLayout,
  ServiceButton,
  s,
} from "@/features/pro-services/ServiceLayout";
import { proError } from "@/features/pro-services/model";
import {
  creditMoney,
  creditStatus,
  repaymentMinor,
  definitiveRepaymentFailure,
} from "@/features/pro-services/assetCreditModel";
import {
  useGetAssetCreditQuery,
  useDecideAssetCreditMutation,
  useRepayAssetCreditMutation,
} from "@/store/api/assetCreditApi";
import { useScreenIsActive } from "@/hooks/useAppIsActive";
import { useWalletScreenScope } from "@/hooks/wallet/useWalletScreenScope";
import { useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/selectors";

type Intent = { mutationId: string; amountMinor: number };
export default function CreditDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const active = useScreenIsActive();
  const user = useAppSelector(selectUser);
  const captureScope = useWalletScreenScope(
    user?.id ? `${user.id}:${id}` : undefined,
    active,
  );
  const query = useGetAssetCreditQuery(id, {
    skip: !id || !active,
    refetchOnMountOrArgChange: true,
  });
  const [decide, decision] = useDecideAssetCreditMutation();
  const [repay, payment] = useRepayAssetCreditMutation();
  const [amount, setAmount] = useState(""),
    [consent, setConsent] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [message, setMessage] = useState(""),
    [intent, setIntent] = useState<Intent | null>(null),
    [ready, setReady] = useState(false);
  const inFlight = useRef(false);
  const key = `asset-credit-intent:${user?.id}:${id}`;
  useEffect(() => {
    let mounted = true;
    setReady(false);
    setConsent(false);
    setConfirm(false);
    setAmount("");
    setIntent(null);
    setMessage("");
    setShowTerms(false);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!mounted) return;
        const saved = raw ? JSON.parse(raw) : null;
        if (
          saved &&
          (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
            saved.mutationId,
          ) ||
            !Number.isSafeInteger(saved.amountMinor) ||
            saved.amountMinor <= 0 ||
            saved.amountMinor % 10 !== 0 ||
            saved.amountMinor > 1e12)
        )
          throw Error("Invalid intent");
        setIntent(saved);
        setReady(true);
      })
      .catch(() => {
        if (mounted)
          setMessage(
            "Impossible de retrouver la dernière opération. Fermez puis rouvrez cet écran.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [key]);
  const c = query.data?.id === id ? query.data : undefined;
  const remaining = c ? Number(c.principalMinor) - Number(c.paidMinor) : 0;
  const minor = repaymentMinor(amount);
  const busy = payment.isLoading || decision.isLoading;
  const decideNow = async (accept: boolean) => {
    const current = captureScope();
    if (
      !current() ||
      !c ||
      c.status !== "offered" ||
      (accept && !consent) ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    setMessage("");
    try {
      await decide({ id, accept, policyVersion: c.policyVersion }).unwrap();
      if (current()) setConsent(false);
    } catch (e) {
      if (current()) setMessage(proError(e));
    } finally {
      inFlight.current = false;
    }
  };
  const pay = async () => {
    const current = captureScope();
    if (
      !current() ||
      !c ||
      (!intent && (c.status !== "active" || !confirm)) ||
      inFlight.current ||
      !ready ||
      (!intent && (!minor || minor > remaining))
    )
      return;
    inFlight.current = true;
    setMessage("");
    const operation = intent ?? {
      mutationId: randomUUID(),
      amountMinor: minor!,
    };
    try {
      // Persist BEFORE sending: reopening/retrying an uncertain result reuses the same operation.
      await AsyncStorage.setItem(key, JSON.stringify(operation));
      if (!current()) return;
      setIntent(operation);
      await repay({ id, ...operation }).unwrap();
      if (!current()) return;
      await AsyncStorage.removeItem(key);
      if (!current()) return;
      setIntent(null);
      setAmount("");
      setConfirm(false);
      setMessage("Remboursement enregistré.");
    } catch (e) {
      if (!current()) return;
      if (definitiveRepaymentFailure(e)) {
        try {
          await AsyncStorage.removeItem(key);
          if (!current()) return;
          setIntent(null);
          setConfirm(false);
        } catch {
          /* Keep the persisted operation for a safe retry. */
        }
      }
      setMessage(proError(e));
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <ServiceLayout title="Mon crédit">
      {query.isLoading && (
        <ActivityIndicator accessibilityLabel="Chargement du contrat" />
      )}
      {query.isError && (
        <>
          <Text style={s.error}>{proError(query.error)}</Text>
          <ServiceButton
            title="Réessayer"
            secondary
            onPress={() => query.refetch()}
          />
        </>
      )}
      {c && (
        <>
          <Text style={s.badge}>{creditStatus[c.status]}</Text>
          <Text style={s.title}>{c.label}</Text>
          <View style={s.notice}>
            <Text style={s.text}>
              {c.status === "offered"
                ? "Montant proposé"
                : c.status === "accepted"
                  ? "Montant du matériel"
                  : "Reste à rembourser"}
            </Text>
            <Text style={s.title}>{creditMoney(remaining)}</Text>
            {["active", "settled"].includes(c.status) && (
              <Text style={s.text}>
                {creditMoney(c.paidMinor)} remboursés sur{" "}
                {creditMoney(c.principalMinor)}
              </Text>
            )}
            {Number(c.dueMinor) > 0 && (
              <Text style={s.error}>
                {creditMoney(c.dueMinor)} non prélevés sur les trajets cash,
                inclus dans ce reste.
              </Text>
            )}
          </View>
          <Text style={s.text}>{c.policyText}</Text>
          {c.status === "offered" ? (
            <>
              <Text style={s.label}>Votre contrat</Text>
              <Text style={s.text}>{c.terms}</Text>
            </>
          ) : (
            <>
              <ServiceButton
                title={showTerms ? "Masquer le contrat" : "Voir mon contrat"}
                secondary
                onPress={() => setShowTerms(!showTerms)}
              />
              {showTerms && <Text style={s.text}>{c.terms}</Text>}
            </>
          )}
          {c.status === "offered" && (
            <>
              <TouchableOpacity
                style={s.option}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent, disabled: busy }}
                disabled={busy}
                onPress={() => setConsent(!consent)}
              >
                <Text style={s.label}>
                  {consent ? "☑" : "☐"} J’accepte ce contrat et les
                  remboursements indiqués.
                </Text>
              </TouchableOpacity>
              <ServiceButton
                title="Accepter le contrat"
                busy={busy}
                disabled={!consent || !active}
                onPress={() => decideNow(true)}
              />
              <ServiceButton
                title="Refuser l’offre"
                secondary
                disabled={busy || !active}
                onPress={() => decideNow(false)}
              />
            </>
          )}
          {c.status === "accepted" && (
            <Text style={s.text}>
              Aucun prélèvement avant la remise du matériel enregistrée par
              Zwanga.
            </Text>
          )}
          {(c.status === "active" || intent) && (
            <View style={s.section}>
              <Text style={s.label}>Rembourser avec mon solde</Text>
              <Text style={s.text}>
                Vous choisissez le montant. Recharger votre compte ne déclenche
                pas ce paiement.
              </Text>
              {intent ? (
                <Text style={s.text}>
                  Vérifier le remboursement de {creditMoney(intent.amountMinor)}{" "}
                  déjà envoyé. Il ne sera pas débité deux fois.
                </Text>
              ) : (
                <>
                  <TextInput
                    accessibilityLabel="Montant du remboursement en francs congolais"
                    style={s.input}
                    value={amount}
                    editable={!busy && !confirm}
                    keyboardType="decimal-pad"
                    placeholder="Montant en FC"
                    onChangeText={setAmount}
                  />
                  {confirm && (
                    <Text style={s.label}>
                      Prélever {creditMoney(minor ?? 0)} sur votre solde
                      rechargé ?
                    </Text>
                  )}
                </>
              )}
              <ServiceButton
                title={
                  intent
                    ? "Vérifier ce remboursement"
                    : confirm
                      ? "Confirmer le remboursement"
                      : "Rembourser"
                }
                busy={busy}
                disabled={
                  !active ||
                  !ready ||
                  (!intent && (!minor || minor > remaining))
                }
                onPress={() => (intent || confirm ? pay() : setConfirm(true))}
              />
              {confirm && !intent && !busy && (
                <ServiceButton
                  title="Modifier le montant"
                  secondary
                  onPress={() => setConfirm(false)}
                />
              )}
            </View>
          )}
          {!!message && (
            <Text accessibilityRole="alert" style={s.text}>
              {message}
            </Text>
          )}
          {!!c.entries?.length && (
            <>
              <Text style={s.label}>Derniers mouvements</Text>
              {c.entries.map((e) => (
                <View key={e.id} style={s.section}>
                  <Text style={s.label}>
                    {e.kind === "wallet"
                      ? "Remboursement volontaire"
                      : e.kind === "reversal"
                        ? "Correction de trajet"
                        : e.kind === "trip_cash"
                          ? "Trajet cash"
                          : "Revenu du trajet"}
                  </Text>
                  <Text style={s.text}>
                    {creditMoney(e.amountMinor)} remboursés ·{" "}
                    {new Date(e.createdAt).toLocaleDateString("fr-FR")}
                  </Text>
                  {Number(e.dueDeltaMinor) !== 0 && (
                    <Text style={s.text}>
                      Variation du montant dû : {creditMoney(e.dueDeltaMinor)}
                    </Text>
                  )}
                </View>
              ))}
            </>
          )}
        </>
      )}
    </ServiceLayout>
  );
}
