import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import {
  ServiceLayout,
  ServiceButton,
  s,
} from "@/features/pro-services/ServiceLayout";
import {
  ServiceDirectory,
  ServiceCaseLink,
} from "@/features/pro-services/ServiceCatalogue";
import { proError } from "@/features/pro-services/model";
import {
  useGetMyProCasesQuery,
  useGetProOfferingsQuery,
  useGetCurrentDocumentCaseQuery,
} from "@/store/api/proServicesApi";
import { useScreenIsActive } from "@/hooks/useAppIsActive";
import { router, type Href } from 'expo-router';

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
  const currentDocuments = useGetCurrentDocumentCaseQuery(undefined, {
    skip: !active,
    refetchOnMountOrArgChange: true,
  });
  const catalogueState = catalogue.isLoading ? 'loading' : catalogue.isError ? 'error' : 'ready';
  return (
    <ServiceLayout
      title="Services pro"
      embedded={embedded}
      bottomOverlay={bottomOverlay}
    >
      <Text style={s.text}>Choisissez votre service.</Text>
      <TouchableOpacity accessibilityRole="button" style={[s.section,s.row]} disabled={!active}
        onPress={()=>router.push('/services/credit' as Href)}>
        <Ionicons name="phone-portrait-outline" size={28} color="#C34412"/>
        <View style={s.flex}><Text style={s.label}>Téléphone à crédit</Text><Text style={s.text}>Votre offre, votre solde et vos remboursements.</Text></View>
        <Ionicons name="chevron-forward" size={20} color="#C34412"/>
      </TouchableOpacity>
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
      <ServiceDirectory
        items={offerings}
        state={catalogueState}
        current={currentDocuments.currentData?.request}
        checking={currentDocuments.isFetching}
        active={active}
      />
      <View style={[s.row, { alignItems: "flex-start" }]}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#647582" />
        <Text style={[s.text, s.flex]}>
          Documents et flottes : vous validez le devis et le contrat avant tout engagement.
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
                  {cursor ? "Aucun autre dossier" : "Pas encore de dossier"}
                </Text>
                <Text style={s.text}>
                  Vos démarches et les réponses de l’équipe apparaîtront ici.
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
      <ServiceDirectory secondary items={offerings} active={active} state={catalogueState} />
    </ServiceLayout>
  );
}
