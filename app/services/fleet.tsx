import React, { useRef, useState } from "react";
import { router } from "expo-router";
import { fleetTerms } from "@/features/pro-services/fleetPaymentModel";
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
import { useScreenIsActive } from "@/hooks/useAppIsActive";
import {
  useGetMyFleetAssignmentsQuery,
  useDecideFleetAssignmentMutation,
  useGetMyFleetOrganizationsQuery,
  useCreateFleetOrganizationMutation,
} from "@/store/api/fleetRegistryApi";
export default function FleetScreen() {
  const active = useScreenIsActive();
  const [before, setBefore] = useState<string>();
  const q = useGetMyFleetAssignmentsQuery(
    { before },
    {
      skip: !active,
      refetchOnMountOrArgChange: true,
    },
  );
  const orgs = useGetMyFleetOrganizationsQuery(undefined, {
    skip: !active,
    refetchOnMountOrArgChange: true,
  });
  const [decide, state] = useDecideFleetAssignmentMutation(),
    [create, creating] = useCreateFleetOrganizationMutation();
  const [expanded, setExpanded] = useState(""),
    [agreed, setAgreed] = useState(false),
    [name, setName] = useState(""),
    [adding, setAdding] = useState(false),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  const run = async (action: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setMessage("");
    try {
      await action();
      setAgreed(false);
      setMessage("Enregistré.");
    } catch (e) {
      setMessage(proError(e));
    } finally {
      lock.current = false;
    }
  };
  const busy = state.isLoading || creating.isLoading;
  const fleets =
    orgs.data?.items.filter((x) =>
      x.partnerTypes.some((t) => t.type === "FLEET_OWNER"),
    ) ?? [];
  return (
    <ServiceLayout title="Flottes">
      <Text style={s.title}>Mes véhicules de flotte</Text>
      <Text style={s.text}>
        Consultez les conditions du propriétaire avant d’accepter une
        affectation.
      </Text>
      {q.isLoading && (
        <ActivityIndicator accessibilityLabel="Chargement des affectations" />
      )}
      {(q.isError || orgs.isError) && (
        <>
          <Text style={s.error}>{proError(q.error ?? orgs.error)}</Text>
          <ServiceButton
            title="Réessayer"
            secondary
            onPress={() => {
              q.refetch();
              orgs.refetch();
            }}
          />
        </>
      )}
      {q.data?.items.length === 0 && (
        <View style={s.notice}>
          <Text style={s.label}>Aucune affectation</Text>
          <Text style={s.text}>
            Votre invitation apparaîtra ici quand un propriétaire vous proposera
            un véhicule.
          </Text>
        </View>
      )}
      {q.data?.items.map((a) => (
        <View key={a.id} style={s.section}>
          <Text style={s.badge}>
            {a.status === "PENDING"
              ? "Votre accord est requis"
              : a.status === "ACTIVE"
                ? "Affectation active"
                : a.status === "ENDED"
                  ? "Affectation terminée"
                  : "Invitation refusée ou annulée"}
          </Text>
          <Text style={s.label}>
            {a.brand} {a.model} · {a.plate}
          </Text>
          <Text style={s.text}>{a.organizationName}</Text>
          <Text style={s.label}>{fleetTerms(a)}</Text>
          {!!a.periodicAmountMinor &&
            ["ACTIVE", "ENDED"].includes(a.status) && (
              <ServiceButton
                title="Mes versements"
                secondary
                onPress={() =>
                  router.push({
                    pathname: "/services/fleet-payments/[id]",
                    params: { id: a.id },
                  })
                }
              />
            )}
          <ServiceButton
            secondary
            title={
              expanded === a.id
                ? "Masquer les conditions"
                : "Lire les conditions"
            }
            disabled={busy}
            onPress={() => {
              setExpanded(expanded === a.id ? "" : a.id);
              setAgreed(false);
            }}
          />
          {expanded === a.id && (
            <>
              <Text style={s.text}>{a.terms}</Text>
              <Text style={s.text}>
                Cette affectation ne prélève rien sur votre compte.
              </Text>
              {a.status === "PENDING" && (
                <>
                  <TouchableOpacity
                    style={s.option}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: agreed }}
                    disabled={busy}
                    onPress={() => setAgreed(!agreed)}
                  >
                    <Text style={s.label}>
                      {agreed ? "☑" : "☐"} J’accepte ces conditions.
                    </Text>
                  </TouchableOpacity>
                  <ServiceButton
                    title="Accepter le véhicule"
                    busy={busy}
                    disabled={!active || !agreed}
                    onPress={() =>
                      run(() =>
                        decide({
                          id: a.id,
                          accept: true,
                          ...(a.periodicAmountMinor
                            ? { paymentTermsConfirmed: true as const }
                            : {}),
                        }).unwrap(),
                      )
                    }
                  />
                  <ServiceButton
                    title="Refuser"
                    secondary
                    disabled={busy || !active}
                    onPress={() =>
                      run(() => decide({ id: a.id, accept: false }).unwrap())
                    }
                  />
                </>
              )}
            </>
          )}
        </View>
      ))}
      {!!q.data?.nextCursor && (
        <ServiceButton
          title="Affectations précédentes"
          secondary
          disabled={q.isFetching}
          onPress={() => setBefore(q.data?.nextCursor ?? undefined)}
        />
      )}
      {!!before && (
        <ServiceButton
          title="Revenir aux plus récentes"
          secondary
          onPress={() => setBefore(undefined)}
        />
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={s.text}>
          {message}
        </Text>
      )}
      <View style={s.section}>
        <Text style={s.label}>Vous gérez des véhicules ?</Text>
        {fleets.map((o) => (
          <View key={o.id}>
            <Text style={s.label}>{o.displayName}</Text>
            <Text style={s.text}>
              {o.status === "ACTIVE"
                ? "Espace actif : gérez vos véhicules et affectations dans le portail partenaire Zwanga."
                : "Espace en cours de validation par Zwanga."}
            </Text>
          </View>
        ))}
        {fleets.length === 0 && orgs.data && (
          <>
            <ServiceButton
              title={adding ? "Fermer" : "Créer mon espace propriétaire"}
              secondary
              disabled={busy}
              onPress={() => setAdding(!adding)}
            />
            {adding && (
              <>
                <TextInput
                  style={s.input}
                  value={name}
                  onChangeText={setName}
                  accessibilityLabel="Nom de votre flotte"
                  placeholder="Nom de votre flotte"
                  maxLength={160}
                />
                <Text style={s.text}>
                  Pour un propriétaire individuel. Une entreprise peut ouvrir
                  son espace sur le portail partenaire.
                </Text>
                <ServiceButton
                  title="Soumettre mon espace"
                  busy={busy}
                  disabled={!active || name.trim().length < 2}
                  onPress={() =>
                    run(async () => {
                      await create({ displayName: name.trim() }).unwrap();
                      setAdding(false);
                    })
                  }
                />
              </>
            )}
          </>
        )}
      </View>
    </ServiceLayout>
  );
}
