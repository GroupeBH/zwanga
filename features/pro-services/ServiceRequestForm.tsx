import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React, { useEffect, useRef } from "react";
import { BackHandler, Keyboard, ScrollView, Text, View } from "react-native";
import type { ProOffering, ProCase } from "@/types/proServices";
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
  existing,
}: {
  offering: ProOffering;
  initial: { fullName: string; phone: string };
  active: boolean;
  existing?: Pick<ProCase, 'id' | 'application' | 'updatedAt' | 'editMode'>;
}) {
  const c = useProServiceForm(offering, initial, existing);
  const { step, sent, locked, goTo } = c;
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!active) return;
    Keyboard.dismiss();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [active, c.step, c.sent, c.uncertain]);
  useEffect(() => {
    if (!active || step === 0) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (sent) router.replace(servicesRoute);
        else if (locked) router.push(servicesRoute);
        else goTo((step - 1) as FormStep);
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, step, locked, goTo, sent]);
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
        title={existing ? "Demande modifiée" : "Demande envoyée"}
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
          <Text style={f.title}>{existing ? "Vos modifications ont été enregistrées." : "Votre demande a bien été reçue."}</Text>
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
                <Text style={s.label}>{c.additionsOnly ? "Étude des documents ajoutés" : "Votre accord avant toute suite"}</Text>
                <Text style={s.text}>
                  {c.additionsOnly ? 'Cet ajout ne modifie pas le contrat et les paiements existants.' : 'Un devis et des conditions validées devront vous être présentés.'}
                </Text>
              </View>
            </View>
          </View>
          <Text style={f.small}>
            {existing ? 'Aucun nouveau paiement ni financement déclenché.' : 'Aucun paiement effectué. Aucun financement engagé.'}
          </Text>
        </View>
      </ServiceLayout>
    );
  return (
    <ServiceLayout
      title={existing ? "Modifier ma demande" : "Nouvelle demande"}
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
          {c.alreadyExists || c.mustReload ? (
            <ServiceButton
              title={c.mustReload ? "Actualiser mon dossier" : "Voir ma demande"}
              onPress={() => router.replace((existing ? `/services/${existing.id}` : '/services') as Href)}
            />
          ) : <ServiceButton
            title={
              c.step < 2
                ? "Continuer"
                : c.uncertain
                  ? "Vérifier mon envoi"
                  : existing ? "Enregistrer les modifications" : "Envoyer ma demande"
            }
            busy={c.busy}
            disabled={
              !active || (!existing && !c.uncertain && offering.availability !== "open")
            }
            onPress={() => {
              Keyboard.dismiss();
              if (c.step < 2) c.next();
              else void c.submit();
            }}
          />}
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
      {existing && <Text style={s.text}>{c.additionsOnly
        ? 'Ajoutez un document à ce dossier. Le contrat et les paiements existants restent inchangés. L’équipe étudiera cet ajout séparément.'
        : 'Votre dossier reste le même. Les modifications seront réétudiées avant tout accord.'}</Text>}
      {!existing && offering.availability !== "open" && (
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
