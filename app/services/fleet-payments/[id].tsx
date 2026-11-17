import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import {
  ServiceLayout,
  ServiceButton,
  s,
} from "@/features/pro-services/ServiceLayout";
import {
  creditMoney,
  repaymentMinor,
} from "@/features/pro-services/assetCreditModel";
import {
  fleetPaymentStatus,
  fleetTerms,
} from "@/features/pro-services/fleetPaymentModel";
import { proError } from "@/features/pro-services/model";
import { useScreenIsActive } from "@/hooks/useAppIsActive";
import {
  useFleetPaymentDeclaration,
  validFleetDeclaration,
} from "@/hooks/fleet/useFleetPaymentDeclaration";
import { useGetFleetPaymentsQuery } from "@/store/api/fleetPaymentsApi";
import { useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/selectors";

export default function FleetPayments() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const user = useAppSelector(selectUser);
  return <PaymentScreen key={`${user?.id}:${id}`} id={id} userId={user?.id} />;
}
function PaymentScreen({ id, userId }: { id: string; userId?: string }) {
  const active = useScreenIsActive();
  const [before, setBefore] = useState<string>();
  const q = useGetFleetPaymentsQuery(
    { id, before },
    { skip: !id || !userId || !active, refetchOnMountOrArgChange: true },
  );
  const data = q.currentData?.assignment.id === id ? q.currentData : undefined;
  const a = data?.assignment;
  const flow = useFleetPaymentDeclaration(userId, id, active);
  const [adding, setAdding] = useState(false),
    [amount, setAmount] = useState("");
  const [reference, setReference] = useState(""),
    [periodLabel, setPeriod] = useState("");
  const [paidOn, setPaidOn] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const draft = {
    amountMinor: repaymentMinor(amount) ?? 0,
    paidOn,
    reference,
    periodLabel,
  };
  const permitted =
    a?.periodicAmountMinor && ["ACTIVE", "ENDED"].includes(a.status);
  const editing = adding || !!flow.intent;
  return (
    <ServiceLayout
      title={editing ? "Déclarer un versement" : "Mes versements"}
      onBack={adding && !flow.intent ? () => setAdding(false) : undefined}
    >
      {q.isLoading && (
        <ActivityIndicator accessibilityLabel="Chargement des versements" />
      )}
      {q.isError && <Text style={s.error}>{proError(q.error)}</Text>}
      {!editing && (
        <ServiceButton
          title="Actualiser"
          secondary
          disabled={!active || !id || !userId || q.isFetching}
          onPress={() => q.refetch()}
        />
      )}
      {a && data && (
        <>
          <Text style={editing ? s.label : s.title}>
            {a.brand} {a.model}
          </Text>
          {!editing && (
            <Text style={s.text}>
              {a.plate} · {a.organizationName}
            </Text>
          )}
          <Text style={s.label}>{fleetTerms(a)}</Text>
          {!editing && (
            <>
              <Text style={s.text}>
                Versements effectués hors Zwanga. Aucun prélèvement sur votre
                solde.
              </Text>
              <View style={s.section}>
                <Text style={s.label}>
                  {creditMoney(data.confirmedMinor)} reçus
                </Text>
                <Text style={s.text}>
                  {creditMoney(data.declaredMinor)} à confirmer
                </Text>
              </View>
            </>
          )}
          {permitted && !editing && (
            <ServiceButton
              title="Déclarer un versement"
              disabled={flow.busy}
              onPress={() => setAdding(!adding)}
            />
          )}
          {((adding && permitted) || flow.intent) && (
            <View style={s.section}>
              {flow.intent ? (
                <Text style={s.text}>
                  Reprendre l’envoi de {creditMoney(flow.intent.amountMinor)}.
                  Cette déclaration ne sera pas enregistrée deux fois.
                </Text>
              ) : (
                <>
                  <Text style={s.text}>
                    Déclarez le montant déjà versé au propriétaire. Aucun débit
                    dans Zwanga.
                  </Text>
                  <Text style={s.label}>Montant en FC</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Montant du versement en FC"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="number-pad"
                    editable={!flow.busy}
                    maxLength={11}
                    placeholder="Ex. 5000"
                  />
                  <Text style={s.label}>Date du versement (AAAA-MM-JJ)</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Date du versement"
                    value={paidOn}
                    onChangeText={setPaidOn}
                    editable={!flow.busy}
                    maxLength={10}
                    placeholder="2026-11-13"
                  />
                  <Text style={s.label}>Période concernée</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Période concernée"
                    value={periodLabel}
                    onChangeText={setPeriod}
                    editable={!flow.busy}
                    maxLength={100}
                    placeholder="Ex. Semaine du 9 au 15 novembre"
                  />
                  <Text style={s.label}>Référence ou précision</Text>
                  <TextInput
                    style={s.input}
                    accessibilityLabel="Référence du versement"
                    value={reference}
                    onChangeText={setReference}
                    editable={!flow.busy}
                    maxLength={160}
                    placeholder="Ex. Référence du transfert ou reçu cash"
                  />
                </>
              )}
              <ServiceButton
                title={
                  flow.intent ? "Vérifier mon envoi" : "J’ai versé ce montant"
                }
                busy={flow.busy}
                disabled={
                  !active ||
                  !flow.ready ||
                  (!flow.intent && !validFleetDeclaration(draft))
                }
                onPress={async () => {
                  if (await flow.submit(draft)) {
                    setAdding(false);
                    setAmount("");
                    setReference("");
                    setPeriod("");
                    setBefore(undefined);
                  }
                }}
              />
            </View>
          )}
          {!!flow.message && (
            <Text accessibilityRole="alert" style={s.text}>
              {flow.message}
            </Text>
          )}
          {!editing && (
            <>
              <Text style={s.label}>Historique des versements</Text>
              {!data.items.length && (
                <Text style={s.text}>Aucun versement déclaré.</Text>
              )}
              {data.items.map((p) => (
                <View key={p.id} style={s.section}>
                  <Text style={s.label}>
                    {creditMoney(p.amountMinor)} ·{" "}
                    {p.paidOn.split("-").reverse().join("/")}
                  </Text>
                  <Text style={s.badge}>{fleetPaymentStatus[p.status]}</Text>
                  <Text style={s.text}>
                    {p.periodLabel} · {p.reference}
                  </Text>
                  {!!p.decisionNote && (
                    <Text style={s.text}>{p.decisionNote}</Text>
                  )}
                </View>
              ))}
              {!!data.nextCursor && (
                <ServiceButton
                  title="Versements précédents"
                  secondary
                  onPress={() => setBefore(data.nextCursor ?? undefined)}
                />
              )}
              {!!before && (
                <ServiceButton
                  title="Revenir aux plus récents"
                  secondary
                  onPress={() => setBefore(undefined)}
                />
              )}
            </>
          )}
        </>
      )}
    </ServiceLayout>
  );
}
