import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import {
  ServiceLayout,
  ServiceButton,
  s,
} from "@/features/pro-services/ServiceLayout";
import {
  documentStates,
  proAmount,
  proError,
  serviceNames,
  statusNames,
} from "@/features/pro-services/model";
import {
  useGetProCaseQuery,
  useAcceptProQuoteMutation,
  useCancelProCaseMutation,
} from "@/store/api/proServicesApi";
import { useScreenIsActive } from "@/hooks/useAppIsActive";

export default function ServiceCaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const active = useScreenIsActive();
  const result = useGetProCaseQuery(id, {
    skip: !id || !active,
    refetchOnMountOrArgChange: 30,
  });
  const [accept, accepting] = useAcceptProQuoteMutation();
  const [cancel, cancelling] = useCancelProCaseMutation();
  const [consent, setConsent] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState("");
  const item = result.currentData,
    quote = item?.quote;
  const busy = accepting.isLoading || cancelling.isLoading;
  useEffect(() => {
    setConsent(false);
    setConfirmCancel(false);
  }, [id, quote?.version]);
  const action = async (kind: "accept" | "cancel") => {
    if (busy || !item) return;
    setError("");
    try {
      if (kind === "accept" && quote && consent)
        await accept({
          id,
          quoteVersion: quote.version,
          consent: true,
        }).unwrap();
      else if (kind === "cancel") await cancel(id).unwrap();
      setConsent(false);
      setConfirmCancel(false);
    } catch (reason) {
      setError(proError(reason));
    }
  };
  return (
    <ServiceLayout title="Mon dossier">
      {result.isLoading && <ActivityIndicator />}
      {result.isError && <Text style={s.error}>{proError(result.error)}</Text>}
      <ServiceButton
        title="Actualiser le dossier"
        secondary
        busy={result.isFetching}
        disabled={!active}
        onPress={() => result.refetch()}
      />
      {item && (
        <>
          <Text style={s.eyebrow}>{statusNames[item.status]}</Text>
          <Text style={s.title}>{serviceNames[item.serviceCode]}</Text>
          <Text style={s.text}>Référence : {item.id}</Text>
          {!!item.customerMessage && (
            <View style={s.notice}>
              <Text style={s.label}>Message de l’équipe</Text>
              <Text style={s.text}>{item.customerMessage}</Text>
            </View>
          )}
          <View style={s.section}>
            <Text style={s.label}>Votre demande</Text>
            <Text style={s.text}>
              {item.application.fullName} · {item.application.phone}
            </Text>
            {!!item.application.vehicleDescription && (
              <Text style={s.text}>
                {item.application.vehicleDescription} {item.application.plate}
              </Text>
            )}
            {!!item.application.description && (
              <Text style={s.text}>{item.application.description}</Text>
            )}
          </View>
          {quote ? (
            <>
              <View style={s.section}>
                <Text style={s.heading}>Devis · version {quote.version}</Text>
                <Text style={s.text}>{quote.description}</Text>
                <Text style={s.text}>Prestataire : {quote.providerName}</Text>
                <Text style={s.label}>
                  Total : {proAmount(quote.totalMinor, quote.currency)}
                </Text>
                <Text style={s.text}>
                  Apport : {proAmount(quote.depositMinor, quote.currency)}
                </Text>
                <Text style={s.text}>
                  Avance prévue :{" "}
                  {proAmount(
                    quote.totalMinor - quote.depositMinor,
                    quote.currency,
                  )}
                </Text>
                <Text style={s.text}>
                  Valable jusqu’au{" "}
                  {new Date(quote.validUntil).toLocaleDateString("fr-FR")}
                </Text>
                {quote.installments.map((line, i) => (
                  <Text key={i} style={s.text}>
                    {new Date(line.dueDate).toLocaleDateString("fr-FR")} —{" "}
                    {proAmount(line.amountMinor, quote.currency)}
                  </Text>
                ))}
              </View>
              {!!quote.retainedDocuments.length && (
                <View style={s.notice}>
                  <Text style={s.label}>Originaux prévus au contrat</Text>
                  {quote.retainedDocuments.map((doc) => (
                    <Text key={doc.code} style={s.text}>
                      {doc.label}
                    </Text>
                  ))}
                  <Text style={s.text}>
                    La remise se fera contre reçu. La garde ne remplace pas une
                    garantie juridiquement constituée.
                  </Text>
                </View>
              )}
              {quote.terms && (
                <View style={s.terms}>
                  <Text style={s.label}>
                    Conditions · {quote.terms.version}
                  </Text>
                  <Text selectable style={s.text}>
                    {quote.terms.text}
                  </Text>
                </View>
              )}
              {item.status === "quoted" &&
                (item.canAccept ? (
                  <>
                    <TouchableOpacity
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: consent }}
                      style={s.option}
                      disabled={busy}
                      onPress={() => setConsent(!consent)}
                    >
                      <Ionicons
                        name={consent ? "checkbox" : "square-outline"}
                        size={24}
                        color="#D84D16"
                      />
                      <Text style={[s.text, s.flex]}>
                        J’ai lu et j’accepte ce devis, son échéancier et ses
                        conditions, y compris les originaux expressément
                        indiqués.
                      </Text>
                    </TouchableOpacity>
                    <ServiceButton
                      title="Accepter ce devis"
                      busy={accepting.isLoading}
                      disabled={!consent || busy}
                      onPress={() => action("accept")}
                    />
                  </>
                ) : (
                  <View style={s.notice}>
                    <Text style={s.label}>Acceptation indisponible</Text>
                    <Text style={s.text}>
                      Le contrat validé ou un devis à jour est nécessaire. Aucun
                      engagement financier n’a été créé.
                    </Text>
                  </View>
                ))}
            </>
          ) : (
            <Text style={s.text}>
              L’équipe étudie votre dossier. Vous recevrez un devis ici avant
              tout engagement.
            </Text>
          )}
          {item.acceptedAt && (
            <View style={s.section}>
              <Text style={s.heading}>Financement</Text>
              <Text style={s.text}>
                Apport enregistré :{" "}
                {proAmount(item.finances.depositPaidMinor, quote?.currency)}
              </Text>
              <Text style={s.text}>
                Avance versée au prestataire :{" "}
                {proAmount(item.finances.fundedMinor, quote?.currency)}
              </Text>
              <Text style={s.text}>
                Remboursé :{" "}
                {proAmount(item.finances.repaidMinor, quote?.currency)}
              </Text>
              <Text style={s.label}>
                Solde dû :{" "}
                {proAmount(item.finances.balanceMinor, quote?.currency)}
              </Text>
              {!item.finances.fundedMinor && (
                <Text style={s.text}>
                  L’avance n’est pas encore enregistrée comme versée.
                </Text>
              )}
              <Text style={s.text}>
                Les versements sont vérifiés par l’équipe. Ce suivi ne déclenche
                aucun prélèvement sur vos revenus.
              </Text>
            </View>
          )}
          {!!item.documents.length && (
            <View style={s.section}>
              <Text style={s.heading}>Vos originaux</Text>
              {item.documents.map((doc) => (
                <View key={doc.id} style={{ gap: 4 }}>
                  <Text style={s.label}>{doc.label}</Text>
                  <Text style={s.text}>{documentStates[doc.status]}</Text>
                  {!!doc.receipt && (
                    <Text style={s.text}>Reçu de garde : {doc.receipt}</Text>
                  )}
                  {!!doc.returnReceipt && (
                    <Text style={s.text}>
                      Reçu de restitution : {doc.returnReceipt}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          {["submitted", "reviewing", "needs_info", "quoted"].includes(
            item.status,
          ) && (
            <>
              {confirmCancel && (
                <Text style={s.error}>
                  Voulez-vous annuler cette demande ? Aucun financement n’a
                  encore été engagé.
                </Text>
              )}
              <ServiceButton
                secondary
                title={
                  confirmCancel
                    ? "Confirmer l’annulation"
                    : "Annuler ma demande"
                }
                busy={cancelling.isLoading}
                disabled={busy}
                onPress={() =>
                  confirmCancel ? action("cancel") : setConfirmCancel(true)
                }
              />
              {confirmCancel && (
                <ServiceButton
                  secondary
                  title="Conserver ma demande"
                  onPress={() => setConfirmCancel(false)}
                />
              )}
            </>
          )}
        </>
      )}
    </ServiceLayout>
  );
}
