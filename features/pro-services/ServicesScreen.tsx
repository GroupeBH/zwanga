import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import {
  ServiceLayout,
  ServiceButton,
  s,
} from "@/features/pro-services/ServiceLayout";
import {
  OpenService,
  ServiceCaseLink,
  UpcomingServices,
} from "@/features/pro-services/ServiceCatalogue";
import { proError } from "@/features/pro-services/model";
import {
  useGetMyProCasesQuery,
  useGetProOfferingsQuery,
} from "@/store/api/proServicesApi";
import { useScreenIsActive } from "@/hooks/useAppIsActive";

export default function ServicesScreen({
  embedded = false,
  bottomOverlay = 0,
}: {
  embedded?: boolean;
  bottomOverlay?: number;
} = {}) {
  const active = useScreenIsActive();
  const [cursor, setCursor] = useState<string>();
  const catalogue = useGetProOfferingsQuery(undefined, {
    skip: !active,
    refetchOnMountOrArgChange: 60,
  });
  const cases = useGetMyProCasesQuery(cursor, {
    skip: !active,
    refetchOnMountOrArgChange: 30,
  });
  const offerings = catalogue.data ?? [];
  return (
    <ServiceLayout
      title="Services pro"
      embedded={embedded}
      bottomOverlay={bottomOverlay}
    >
      <Text style={s.text}>Vos démarches et leur suivi, au même endroit.</Text>
      {catalogue.isLoading && (
        <ActivityIndicator
          color="#D84D16"
          accessibilityLabel="Chargement des services"
        />
      )}
      {catalogue.isError && (
        <View style={s.notice}>
          <Text accessibilityRole="alert" style={s.error}>
            {proError(catalogue.error)}
          </Text>
          <ServiceButton
            title="Recharger les services"
            secondary
            disabled={!active}
            busy={catalogue.isFetching}
            onPress={() => catalogue.refetch()}
          />
        </View>
      )}
      {offerings
        .filter((item) => item.availability === "open")
        .map((item) => (
          <OpenService key={item.code} item={item} />
        ))}
      {!catalogue.isLoading &&
        !catalogue.isError &&
        !offerings.some((item) => item.availability === "open") && (
          <Text style={s.text}>
            Les nouvelles demandes ne sont pas encore ouvertes. Vos dossiers
            restent accessibles ci-dessous.
          </Text>
        )}
      <View style={[s.row, { alignItems: "flex-start" }]}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#647582" />
        <Text style={[s.text, s.flex]}>
          Aucun paiement à la demande. Vous validez un devis et un contrat avant
          tout engagement.
        </Text>
      </View>
      <View style={{ gap: 0 }}>
        <View style={[s.row, s.between]}>
          <Text style={s.heading}>Mes dossiers</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Actualiser mes dossiers"
            accessibilityState={{
              disabled: !active || cases.isFetching,
              busy: cases.isFetching,
            }}
            style={s.back}
            disabled={!active || cases.isFetching}
            onPress={() => cases.refetch()}
          >
            {cases.isFetching ? (
              <ActivityIndicator color="#647582" />
            ) : (
              <Ionicons name="refresh-outline" size={20} color="#647582" />
            )}
          </TouchableOpacity>
        </View>
        {cases.isError && (
          <View style={s.notice}>
            <Text accessibilityRole="alert" style={s.error}>
              {proError(cases.error)}
            </Text>
            <ServiceButton
              title="Recharger mes dossiers"
              secondary
              disabled={!active}
              busy={cases.isFetching}
              onPress={() => cases.refetch()}
            />
          </View>
        )}
        {!cases.isFetching &&
          !cases.isError &&
          !cases.currentData?.items.length && (
            <View style={[s.notice, s.row]}>
              <Ionicons name="folder-open-outline" size={24} color="#647582" />
              <View style={s.flex}>
                <Text style={s.label}>
                  {cursor ? "Aucun autre dossier" : "Pas encore de demande"}
                </Text>
                <Text style={s.text}>
                  Retrouvez ici vos demandes, les devis et les réponses de
                  l’équipe.
                </Text>
              </View>
            </View>
          )}
        {cases.currentData?.items.map((item) => (
          <ServiceCaseLink key={item.id} item={item} />
        ))}
      </View>
      {cases.currentData?.nextCursor && (
        <ServiceButton
          secondary
          title="Dossiers suivants"
          disabled={cases.isFetching}
          onPress={() => setCursor(cases.currentData?.nextCursor ?? undefined)}
        />
      )}
      {cursor && (
        <ServiceButton
          secondary
          title="Revenir aux plus récents"
          onPress={() => setCursor(undefined)}
        />
      )}
      <UpcomingServices
        items={offerings.filter((item) => item.availability !== "open")}
      />
    </ServiceLayout>
  );
}
