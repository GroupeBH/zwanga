import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from "react-native";
import type { ProOffering } from "@/types/proServices";
import type { useProServiceForm } from "./useProServiceForm";
import { s } from "./ServiceLayout";
import { f } from "./ServiceForm.styles";

type Form = ReturnType<typeof useProServiceForm>;
type Props = { controller: Form; offering: ProOffering };

function Field({
  label,
  error,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  inputRef?: React.Ref<TextInput>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={f.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...props}
        ref={inputRef}
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor="#778792"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          f.input,
          props.multiline && f.multiline,
          focused && f.inputFocused,
          !!error && f.inputError,
        ]}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

function Disclosure({
  open,
  onPress,
  title,
}: {
  open: boolean;
  onPress: () => void;
  title: string;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      style={f.disclosure}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={open ? "remove-circle-outline" : "add-circle-outline"}
        size={21}
        color="#647582"
      />
      <Text style={f.disclosureText}>{title}</Text>
      <Ionicons
        name={open ? "chevron-up" : "chevron-down"}
        size={16}
        color="#647582"
      />
    </TouchableOpacity>
  );
}

export function ServiceNeedStep({ controller: c, offering }: Props) {
  const [noteOpen, setNoteOpen] = useState(!!c.form.description);
  const documents = offering.code === "documents";
  return (
    <View style={f.section}>
      <View style={f.intro}>
        <Text style={f.title}>
          {documents
            ? "Quels documents vous faut-il ?"
            : "Quel est votre besoin ?"}
        </Text>
        <Text style={s.text}>
          {documents
            ? "Choisissez un ou plusieurs documents."
            : "Décrivez ce que vous souhaitez pour votre activité."}
        </Text>
      </View>
      {!!offering.documentOptions.length && (
        <View style={f.field}>
          <Text accessibilityLiveRegion="polite" style={f.small}>
            {c.form.documents.length
              ? `${c.form.documents.length} sélectionné${c.form.documents.length > 1 ? "s" : ""}`
              : "Sélection obligatoire"}
          </Text>
          <View style={f.options}>
            {offering.documentOptions.map((doc, index) => {
              const selected = c.form.documents.includes(doc.code);
              return (
                <TouchableOpacity
                  key={doc.code}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={doc.label}
                  activeOpacity={0.75}
                  style={[
                    f.option,
                    index > 0 && f.optionDivider,
                    selected && f.optionSelected,
                  ]}
                  onPress={() =>
                    c.change(
                      "documents",
                      selected
                        ? c.form.documents.filter((code) => code !== doc.code)
                        : [...c.form.documents, doc.code],
                    )
                  }
                >
                  <Text style={[f.optionLabel, selected && f.selectedLabel]}>
                    {doc.label}
                  </Text>
                  <Ionicons
                    name={selected ? "checkbox" : "square-outline"}
                    size={22}
                    color={selected ? "#C34412" : "#8A99A2"}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          {!!c.errors.documents && (
            <Text accessibilityRole="alert" style={s.error}>
              {c.errors.documents}
            </Text>
          )}
        </View>
      )}
      {documents && (
        <Disclosure
          title="Ajouter une précision (facultatif)"
          open={noteOpen}
          onPress={() => setNoteOpen(!noteOpen)}
        />
      )}
      {(!documents || noteOpen) && (
        <Field
          label={documents ? "Précisions (facultatif)" : "Votre besoin"}
          error={c.errors.description}
          multiline
          value={c.form.description}
          maxLength={2000}
          placeholder={
            documents
              ? "Par exemple : renouvellement d’un document expiré…"
              : "Précisez le service ou l’équipement recherché…"
          }
          onChangeText={(value) => c.change("description", value)}
        />
      )}
    </View>
  );
}

export function ServiceContactStep({ controller: c }: { controller: Form }) {
  const phoneRef = useRef<TextInput>(null);
  const [vehicleOpen, setVehicleOpen] = useState(
    !!(c.form.vehicleDescription || c.form.plate),
  );
  return (
    <View style={f.section}>
      <View style={f.intro}>
        <Text style={f.title}>Comment vous joindre ?</Text>
        <Text style={s.text}>
          L’équipe utilisera ces coordonnées pour étudier votre demande avec
          vous.
        </Text>
      </View>
      <Field
        label="Nom complet"
        value={c.form.fullName}
        error={c.errors.fullName}
        autoComplete="name"
        autoCapitalize="words"
        maxLength={180}
        placeholder="Votre nom complet"
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
        onChangeText={(value) => c.change("fullName", value)}
      />
      <Field
        label="Numéro de contact"
        value={c.form.phone}
        error={c.errors.phone}
        inputRef={phoneRef}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={20}
        placeholder="Votre numéro de téléphone"
        onChangeText={(value) => c.change("phone", value)}
      />
      <View style={f.optional}>
        <Disclosure
          title="Véhicule concerné (facultatif)"
          open={vehicleOpen}
          onPress={() => setVehicleOpen(!vehicleOpen)}
        />
        {vehicleOpen && (
          <View style={f.section}>
            <Field
              label="Marque et modèle"
              value={c.form.vehicleDescription}
              maxLength={180}
              placeholder="Marque, modèle, type de véhicule…"
              onChangeText={(value) => c.change("vehicleDescription", value)}
            />
            <Field
              label="Plaque d’immatriculation"
              value={c.form.plate}
              maxLength={40}
              autoCapitalize="characters"
              placeholder="Si vous en avez une"
              onChangeText={(value) => c.change("plate", value)}
            />
          </View>
        )}
      </View>
    </View>
  );
}
