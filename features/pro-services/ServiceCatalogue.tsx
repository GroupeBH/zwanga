import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type {
  ProCaseRow,
  ProOffering,
  ServiceStatus,
  CurrentDocumentCase,
} from "@/types/proServices";
import { serviceNames, statusNames } from "./model";
import { s } from "./ServiceLayout";
import {
  buildServiceCatalogue,
  servicePresentation,
  type CatalogueEntry,
  type CatalogueState,
  type DisplayServiceCode,
} from './serviceCatalogueModel';

const icons: Record<DisplayServiceCode, keyof typeof Ionicons.glyphMap> = {
  documents: "documents-outline",
  vehicles: "car-outline",
  equipment: "bag-handle-outline",
  fleet: "car-sport-outline",
  delivery: "cube-outline",
  schools: "school-outline",
  health: "medkit-outline",
};

export function ServiceDirectory({
  items, state, current, checking = false, active = true, secondary = false,
}: {
  items: ProOffering[];
  state: CatalogueState;
  current?: CurrentDocumentCase['request'];
  checking?: boolean;
  active?: boolean;
  secondary?: boolean;
}) {
  const catalogue = buildServiceCatalogue(items, state);
  const entries = secondary ? catalogue.secondary : catalogue.primary;
  if (!entries.length) return null;
  return (
    <View style={c.directory} testID={secondary ? 'pro-other-services' : 'pro-main-services'}>
      {secondary && <Text accessibilityRole="header" style={c.sectionTitle}>Autres services</Text>}
      {entries.map(entry => entry.code === 'fleet' ? <FleetServiceEntry key={entry.code} active={active}/> : entry.offering && entry.availability === 'open'
        ? <OpenService
            key={entry.code}
            item={entry.offering}
            active={active}
            current={entry.code === 'documents' ? current : undefined}
            checking={entry.code === 'documents' && checking}
          />
        : <UnavailableService key={entry.code} item={entry} />)}
    </View>
  );
}

export function OpenService({ item, current, checking = false, active = true }: {
  item: ProOffering;
  current?: CurrentDocumentCase['request'];
  checking?: boolean;
  active?: boolean;
}) {
  const copy = servicePresentation(item.code);
  const disabled = checking || !active || item.availability !== 'open';
  const action = checking ? 'Vérification du dossier…' : current
    ? current.canEdit ? 'Modifier mon dossier' : 'Voir mon dossier' : 'Ouvrir le service';
  return (
    <TouchableOpacity style={c.offering} activeOpacity={0.75} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={`${copy.title}. ${copy.description} ${action}`}
      accessibilityState={{ disabled, busy: checking }} testID={`pro-service-${item.code}`}
      onPress={() => {
        if (disabled) return;
        if (current) {
          router.push((current.canEdit ? `/services/edit?id=${current.id}` : `/services/${current.id}`) as Href);
        } else {
          router.push({ pathname: '/services/new', params: { service: item.code } } as Href);
        }
      }}>
      <View style={c.icon}><Ionicons name={icons[item.code]} size={27} color="#C34412" /></View>
      <View style={c.content}>
        <View style={c.titleRow}>
          <Text style={c.title}>{copy.title}</Text>
          <Text style={c.openBadge}>{current ? 'Mon dossier' : 'Disponible'}</Text>
        </View>
        <Text style={c.description}>{copy.description}</Text>
        <Text style={c.action}>{action}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color="#C34412" />
    </TouchableOpacity>
  );
}

/** Fleet membership is an account service, separate from the legacy financing intake. */
export function FleetServiceEntry({active=true}:{active?:boolean}) {
  return <TouchableOpacity style={c.offering} accessibilityRole="button" accessibilityLabel="Flottes. Véhicules et affectations" accessibilityState={{disabled:!active}} disabled={!active} testID="pro-service-fleet"
    onPress={()=>{if(active)router.push('/services/fleet' as Href);}}>
    <View style={c.icon}><Ionicons name="car-sport-outline" size={27} color="#C34412"/></View>
    <View style={c.content}><Text style={c.title}>Flottes</Text><Text style={c.description}>Vos véhicules et affectations.</Text><Text style={c.action}>Ouvrir ma flotte</Text></View>
    <Ionicons name="chevron-forward" size={19} color="#C34412"/>
  </TouchableOpacity>;
}

export function UnavailableService({ item }: { item: CatalogueEntry }) {
  const status = item.availability === 'paused' ? 'En pause' : item.availability === 'checking'
    ? 'Vérification…' : item.availability === 'unavailable' ? 'Indisponible' : 'À venir';
  return (
    <View style={c.futureRow} accessible accessibilityLabel={`${item.title}. ${item.description} ${status}`}
      testID={`pro-service-${item.code}`}>
      <View style={[c.icon, c.futureIcon]}><Ionicons name={icons[item.code]} size={27} color="#405568" /></View>
      <View style={c.content}>
        <View style={c.titleRow}><Text style={c.title}>{item.title}</Text><Text style={c.futureState}>{status}</Text></View>
        <Text style={c.description}>{item.description}</Text>
      </View>
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
  directory: { gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#172D3B', marginBottom: 4 },
  content: { flex: 1, minWidth: 0, gap: 5 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  offering: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    backgroundColor: "#FFF8F3",
    borderRadius: 16,
  },
  icon: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: 14,
    backgroundColor: "#FFE8DA",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 19, fontWeight: '700', color: '#172D3B', flexShrink: 1 },
  description: { fontSize: 13, lineHeight: 19, color: '#556570' },
  action: { color: '#B33E10', fontSize: 13, fontWeight: '700', marginTop: 2 },
  openBadge: { color: '#9B3B14', backgroundColor: '#FFE8DA', fontSize: 11, fontWeight: '600', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  futureIcon: { backgroundColor: '#EDF2F5' },
  futureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF0F2",
  },
  futureState: { fontSize: 11, fontWeight: '600', color: '#52616C', backgroundColor: '#EDF2F5', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
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
