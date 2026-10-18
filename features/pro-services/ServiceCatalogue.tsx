import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type {
  ProCaseRow,
  ProOffering,
  ServiceCode,
  ServiceStatus,
} from "@/types/proServices";
import { serviceNames, statusNames } from "./model";
import { ServiceButton, s } from "./ServiceLayout";

const icons: Record<ServiceCode, keyof typeof Ionicons.glyphMap> = {
  documents: "documents-outline",
  vehicles: "car-outline",
  equipment: "bag-handle-outline",
  fleet: "bus-outline",
};

export function OpenService({ item }: { item: ProOffering }) {
  return (
    <View style={c.offering}>
      <View style={s.row}>
        <View style={c.icon}>
          <Ionicons name={icons[item.code]} size={24} color="#C34412" />
        </View>
        <View style={s.flex}>
          <Text style={c.availability}>DEMANDES OUVERTES</Text>
          <Text style={c.title}>{item.name}</Text>
        </View>
      </View>
      <Text style={s.text}>{item.description}</Text>
      <ServiceButton
        title="Faire une demande"
        onPress={() =>
          router.push({
            pathname: "/services/new",
            params: { service: item.code },
          } as any)
        }
      />
    </View>
  );
}

export function UpcomingServices({ items }: { items: ProOffering[] }) {
  if (!items.length) return null;
  return (
    <View style={c.futureSection}>
      <Text style={s.heading}>Autres services</Text>
      {items.map((item) => (
        <View key={item.code} style={c.futureRow}>
          <Ionicons name={icons[item.code]} size={22} color="#647582" />
          <Text style={[s.text, s.flex]}>{item.name}</Text>
          <Text style={c.futureState}>
            {item.availability === "paused" ? "En pause" : "À venir"}
          </Text>
        </View>
      ))}
    </View>
  );
}

const completed = new Set<ServiceStatus>(["completed", "ready"]);
const needsAttention = new Set<ServiceStatus>(["needs_info", "quoted"]);
export function ServiceCaseLink({ item }: { item: ProCaseRow }) {
  const attention = needsAttention.has(item.status);
  const done = completed.has(item.status);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      activeOpacity={0.7}
      accessibilityLabel={`${serviceNames[item.serviceCode]}, ${statusNames[item.status]}. Voir le dossier`}
      style={c.caseRow}
      onPress={() => router.push(`/services/${item.id}` as any)}
    >
      <View style={s.flex}>
        <View style={c.caseMeta}>
          <Text style={[c.status, attention && c.attention, done && c.done]}>
            {statusNames[item.status]}
          </Text>
          <Text style={c.date}>
            {new Date(item.createdAt).toLocaleDateString("fr-FR")}
          </Text>
        </View>
        <Text style={s.label}>{serviceNames[item.serviceCode]}</Text>
        {!!item.customerMessage && (
          <Text numberOfLines={2} style={c.message}>
            {item.customerMessage}
          </Text>
        )}
      </View>
      <Ionicons
        name="chevron-forward"
        size={19}
        color={attention ? "#C34412" : "#647582"}
      />
    </TouchableOpacity>
  );
}

const c = StyleSheet.create({
  offering: {
    padding: 18,
    gap: 16,
    backgroundColor: "#FFF8F3",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F5DFD1",
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#FFE8DA",
    alignItems: "center",
    justifyContent: "center",
  },
  availability: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#9B3B14",
    marginBottom: 5,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#172D3B" },
  futureSection: { marginTop: 8, gap: 4 },
  futureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF0F2",
  },
  futureState: { fontSize: 12, color: "#647582" },
  caseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EBEE",
  },
  caseMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  status: {
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    color: "#405568",
    backgroundColor: "#EDF2F5",
    fontSize: 12,
    fontWeight: "600",
  },
  attention: { color: "#A74417", backgroundColor: "#FFF0E5" },
  done: { color: "#206547", backgroundColor: "#EAF5EE" },
  date: { fontSize: 12, color: "#647582" },
  message: { fontSize: 14, lineHeight: 20, color: "#647582", marginTop: 6 },
});
