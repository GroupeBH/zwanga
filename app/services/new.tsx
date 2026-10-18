import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import {
  ServiceButton,
  ServiceLayout,
  s,
} from "@/features/pro-services/ServiceLayout";
import { ServiceRequestForm } from "@/features/pro-services/ServiceRequestForm";
import { proError } from "@/features/pro-services/model";
import { useGetProOfferingsQuery } from "@/store/api/proServicesApi";
import { useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/selectors";
import { useScreenIsActive } from "@/hooks/useAppIsActive";

export default function NewServiceScreen() {
  const { service } = useLocalSearchParams<{ service?: string }>();
  const user = useAppSelector(selectUser);
  const active = useScreenIsActive();
  const catalogue = useGetProOfferingsQuery(undefined, { skip: !active });
  const offering = catalogue.data?.find((item) => item.code === service);
  if (offering)
    return (
      <ServiceRequestForm
        key={`${user?.id ?? "anonymous"}:${offering.code}`}
        offering={offering}
        active={active}
        initial={{ fullName: user?.name ?? "", phone: user?.phone ?? "" }}
      />
    );
  return (
    <ServiceLayout title="Nouvelle demande">
      {catalogue.isLoading ? (
        <ActivityIndicator
          color="#D84D16"
          accessibilityLabel="Chargement du formulaire"
        />
      ) : (
        <View style={s.notice}>
          <Text style={s.label}>
            {catalogue.isError
              ? "Le formulaire n’a pas pu se charger"
              : "Service indisponible"}
          </Text>
          <Text
            accessibilityRole={catalogue.isError ? "alert" : undefined}
            style={s.text}
          >
            {catalogue.isError
              ? proError(catalogue.error)
              : "Choisissez un service ouvert aux demandes pour continuer."}
          </Text>
          {catalogue.isError && (
            <ServiceButton
              secondary
              title="Réessayer"
              disabled={!active}
              busy={catalogue.isFetching}
              onPress={() => catalogue.refetch()}
            />
          )}
          <ServiceButton
            secondary
            title="Voir les services"
            onPress={() => router.replace("/services" as Href)}
          />
        </View>
      )}
    </ServiceLayout>
  );
}
