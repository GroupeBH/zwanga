import { router, type Href } from "expo-router";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import {
  ServiceLayout,
  ServiceButton,
  s,
} from "@/features/pro-services/ServiceLayout";
import { proError } from "@/features/pro-services/model";
import {
  creditMoney,
  creditStatus,
} from "@/features/pro-services/assetCreditModel";
import {
  useGetAssetCreditsQuery,
  useGetAssetCreditRequestsQuery,
  useRequestAssetCreditMutation,
} from "@/store/api/assetCreditApi";
import { useScreenIsActive } from "@/hooks/useAppIsActive";

export default function CreditsScreen() {
  const active = useScreenIsActive();
  const query = useGetAssetCreditsQuery(undefined, {
    skip: !active,
    refetchOnMountOrArgChange: true,
  });
  const requests = useGetAssetCreditRequestsQuery(undefined, {
    skip: !active,
    refetchOnMountOrArgChange: true,
  });
  const [request, state] = useRequestAssetCreditMutation();
  const [error, setError] = useState("");
  const lock = useRef(false);
  const submit = async () => {
    if (lock.current) return;
    lock.current = true;
    setError("");
    try {
      await request().unwrap();
    } catch (e) {
      setError(proError(e));
    } finally {
      lock.current = false;
    }
  };
  const pending = requests.data?.items.some((x) => x.status === "submitted");
  return (
    <ServiceLayout title="Téléphone à crédit">
      <Text style={s.title}>Un téléphone pour travailler</Text>
      <Text style={s.text}>
        Recevez une offre de Zwanga. Rien n’est prélevé avant votre accord et la
        remise du matériel.
      </Text>
      <View style={s.notice}>
        <Text style={s.label}>5 % + 5 % pendant le remboursement</Text>
        <Text style={s.text}>
          5 % de commission Zwanga et 5 % pour votre téléphone. Une fois le
          crédit soldé, seule la commission reste.
        </Text>
        <Text style={s.text}>
          En cash, la part de remboursement vient de votre solde rechargé. Si le
          solde ne suffit pas, le reste demeure dû.
        </Text>
      </View>
      {query.isLoading && (
        <ActivityIndicator accessibilityLabel="Chargement des crédits" />
      )}
      {(query.isError || requests.isError) && (
        <>
          <Text accessibilityRole="alert" style={s.error}>
            Service indisponible. Aucun remboursement n’a été lancé.
          </Text>
          <ServiceButton
            title="Réessayer"
            secondary
            onPress={() => {
              query.refetch();
              requests.refetch();
            }}
          />
        </>
      )}
      {query.data?.items.map((item) => (
        <TouchableOpacity
          key={item.id}
          accessibilityRole="button"
          style={s.section}
          onPress={() => router.push(`/services/credit/${item.id}` as Href)}
        >
          <Text style={s.badge}>{creditStatus[item.status]}</Text>
          <Text style={s.label}>{item.label}</Text>
          <Text style={s.text}>
            {item.status === "offered"
              ? "Montant proposé"
              : "Reste à rembourser"}{" "}
            :{" "}
            {creditMoney(Number(item.principalMinor) - Number(item.paidMinor))}
          </Text>
          <Text style={s.eyebrow}>Voir le contrat et les remboursements →</Text>
        </TouchableOpacity>
      ))}
      {pending ? (
        <View style={s.notice}>
          <Text style={s.label}>Votre dossier est reçu</Text>
          <Text style={s.text}>
            L’équipe étudie votre besoin. Votre offre apparaîtra ici.
          </Text>
        </View>
      ) : (
        <ServiceButton
          title="Je souhaite un téléphone"
          busy={state.isLoading}
          disabled={!active || !query.data || !requests.data}
          onPress={submit}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      <Text style={s.text}>
        Véhicules et autres équipements : à venir. Les conditions seront
        précisées pour chaque offre.
      </Text>
    </ServiceLayout>
  );
}
