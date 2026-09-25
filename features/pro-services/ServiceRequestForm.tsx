import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React, { useEffect, useRef } from "react";
import { BackHandler, Keyboard, ScrollView, Text, View } from "react-native";
import type { ProOffering } from "@/types/proServices";
import { ServiceButton, ServiceLayout, s } from "./ServiceLayout";
import { ServiceNeedStep, ServiceContactStep } from "./ServiceFormFields";
import { ServiceFormReview } from "./ServiceFormReview";
import { f } from "./ServiceForm.styles";
import { formSteps, type FormStep } from "./proServiceFormModel";
import { useProServiceForm } from "./useProServiceForm";

// The local Expo route type cache is regenerated when Metro starts.
const servicesRoute = "/services" as Href;

export function ServiceRequestForm({
  offering,
  initial,
  active,
}: {
  offering: ProOffering;
  initial: { fullName: string; phone: string };
  active: boolean;
}) {
  const c = useProServiceForm(offering, initial);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!active) return;
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [active, c.step, c.sent, c.uncertain]);
  useEffect(() => {
    if (!active || c.step === 0) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (c.sent) router.replace(servicesRoute);
        else if (c.locked) router.push(servicesRoute);
        else c.goTo((c.step - 1) as FormStep);
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, c.step, c.locked, c.goTo, c.sent]);
  const onBack = () => {
    if (c.sent) router.replace(servicesRoute);
    else if (c.locked)
      router.push(servicesRoute); // Keep an uncertain in-memory attempt available on return.
    else if (c.step > 0) c.goTo((c.step - 1) as FormStep);
    else if (router.canGoBack()) router.back();
    else router.replace(servicesRoute);
  };
  if (c.sent)
    return (
      <ServiceLayout
        title="Demande envoyée"
        onBack={onBack}
        footer={
          <>
            <ServiceButton
              title="Suivre mon dossier"
              onPress={() => router.replace(`/services/${c.sent}` as any)}
            />
            <ServiceButton
              secondary
              title="Retour aux services"
              onPress={() => router.replace(servicesRoute)}
            />
          </>
        }
      >
        <View style={f.success}>
          <View style={f.successIcon}>
            <Ionicons name="checkmark" size={34} color="#206547" />
          </View>
          <Text style={f.title}>Votre demande a bien été reçue.</Text>
          <Text style={s.text}>
            Vous pouvez retrouver son avancement dans « Mes dossiers ».
          </Text>
          <View>
            <View style={f.nextStep}>
              <Text style={f.stepNumber}>1</Text>
              <View style={s.flex}>
                <Text style={s.label}>Étude de votre besoin</Text>
                <Text style={s.text}>
                  L’équipe examinera la demande et vous contactera.
                </Text>
              </View>
            </View>
            <View style={f.nextStep}>
              <Text style={f.stepNumber}>2</Text>
              <View style={s.flex}>
                <Text style={s.label}>Votre accord avant toute suite</Text>
                <Text style={s.text}>
                  Un devis et des conditions validées devront vous être
                  présentés.
                </Text>
              </View>
            </View>
          </View>
          <Text style={f.small}>
            Aucun paiement effectué. Aucun financement engagé.
          </Text>
        </View>
      </ServiceLayout>
    );
  return (
    <ServiceLayout
      title="Nouvelle demande"
      onBack={onBack}
      scrollRef={scrollRef}
      allowBackGesture={!c.locked}
      footer={
        <>
          {!!(c.message || Object.values(c.errors).find(Boolean)) && (
            <Text accessibilityRole="alert" numberOfLines={3} style={s.error}>
              {c.message || Object.values(c.errors).find(Boolean)}
            </Text>
          )}
          <ServiceButton
            title={
              c.step < 2
                ? "Continuer"
                : c.uncertain
                  ? "Vérifier mon envoi"
                  : "Envoyer ma demande"
            }
            busy={c.busy}
            disabled={
              !active || (!c.uncertain && offering.availability !== "open")
            }
            onPress={() => {
              Keyboard.dismiss();
              if (c.step < 2) c.next();
              else void c.submit();
            }}
          />
          <Text style={f.footerNote}>
            {c.uncertain
              ? "Même demande · aucun nouvel envoi distinct"
              : c.step === 2
                ? "Aucun paiement à cette étape"
                : `Étape ${c.step + 1} sur 3 · ${formSteps[c.step]}`}
          </Text>
        </>
      }
    >
      <View
        accessible
        accessibilityLabel={`Étape ${c.step + 1} sur 3 : ${formSteps[c.step]}`}
        style={f.progress}
      >
        {formSteps.map((label, index) => (
          <View key={label} style={f.progressItem}>
            <View
              style={[f.progressTrack, index <= c.step && f.progressActive]}
            />
            <Text
              style={[f.progressLabel, index === c.step && f.progressSelected]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={f.small}>{offering.name}</Text>
      {offering.availability !== "open" && (
        <Text style={s.error}>
          Les nouvelles demandes sont temporairement indisponibles pour ce
          service.
        </Text>
      )}
      {c.uncertain && (
        <View style={s.notice}>
          <Text style={s.label}>La réception reste à confirmer</Text>
          <Text style={s.text}>
            Vos informations sont conservées sur cet écran. Vérifiez l’envoi
            avec la même demande pour éviter un doublon, ou consultez vos
            dossiers.
          </Text>
          <ServiceButton
            secondary
            title="Voir mes dossiers"
            onPress={() => router.push(servicesRoute)}
          />
        </View>
      )}
      {c.step === 0 && <ServiceNeedStep controller={c} offering={offering} />}
      {c.step === 1 && <ServiceContactStep controller={c} />}
      {c.step === 2 && <ServiceFormReview controller={c} offering={offering} />}
    </ServiceLayout>
  );
}
