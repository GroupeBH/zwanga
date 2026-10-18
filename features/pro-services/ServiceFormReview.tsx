import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { ProOffering } from "@/types/proServices";
import type { useProServiceForm } from "./useProServiceForm";
import { f } from "./ServiceForm.styles";
import { s } from "./ServiceLayout";

export function ServiceFormReview({
  controller: c,
  offering,
}: {
  controller: ReturnType<typeof useProServiceForm>;
  offering: ProOffering;
}) {
  return (
    <View style={f.section}>
      <View style={f.intro}>
        <Text style={f.title}>Tout est correct ?</Text>
        <Text style={s.text}>
          Vérifiez vos informations avant d’envoyer la demande.
        </Text>
      </View>
      <View style={f.reviewSection}>
        <View style={f.reviewHeader}>
          <Text style={[s.label, s.flex]}>Votre besoin</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Modifier mon besoin"
            disabled={c.locked}
            style={f.edit}
            onPress={() => c.goTo(0)}
          >
            <Text style={[f.editLabel, c.locked && s.disabled]}>Modifier</Text>
          </TouchableOpacity>
        </View>
        <Text style={f.small}>{offering.name}</Text>
        {c.form.documents.map((code) => (
          <View key={code} style={s.row}>
            <View style={f.bullet} />
            <Text style={[f.reviewValue, s.flex]}>
              {offering.documentOptions.find((doc) => doc.code === code)
                ?.label ?? code}
            </Text>
          </View>
        ))}
        {!!c.form.description && (
          <Text style={s.text}>{c.form.description}</Text>
        )}
      </View>
      <View style={f.reviewSection}>
        <View style={f.reviewHeader}>
          <Text style={[s.label, s.flex]}>Vos coordonnées</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Modifier mes coordonnées"
            disabled={c.locked}
            style={f.edit}
            onPress={() => c.goTo(1)}
          >
            <Text style={[f.editLabel, c.locked && s.disabled]}>Modifier</Text>
          </TouchableOpacity>
        </View>
        <Text style={f.reviewValue}>{c.form.fullName}</Text>
        <Text style={s.text}>{c.form.phone}</Text>
        {!!(c.form.vehicleDescription || c.form.plate) && (
          <Text style={s.text}>
            Véhicule :{" "}
            {[c.form.vehicleDescription, c.form.plate]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
      </View>
      <View style={f.reassurance}>
        <Ionicons name="shield-checkmark-outline" size={21} color="#405568" />
        <Text style={[s.text, s.flex]}>
          Aucun paiement ni engagement à cet envoi. Tout financement et toute
          garde d’originaux nécessitent un contrat validé et votre accord.
        </Text>
      </View>
      <TouchableOpacity
        accessibilityRole="checkbox"
        accessibilityState={{ checked: c.consent, disabled: c.locked }}
        activeOpacity={0.7}
        disabled={c.locked}
        onPress={c.toggleConsent}
        style={f.consent}
      >
        <Ionicons
          name={c.consent ? "checkbox" : "square-outline"}
          size={24}
          color="#C34412"
        />
        <Text style={[s.text, s.flex]}>
          J’autorise l’équipe Zwanga à me contacter pour étudier cette demande.
        </Text>
      </TouchableOpacity>
      {!!c.errors.consent && (
        <Text accessibilityRole="alert" style={s.error}>
          {c.errors.consent}
        </Text>
      )}
    </View>
  );
}
