import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { getDriverNavigationLayout } from './driverNavigationLayout';
import type { RouteStep } from './navigationModel';
import { cleanHtmlInstructions } from './navigationPresentation';

interface Props {
  step?: RouteStep;
  nextStep?: RouteStep;
  loading: boolean;
  rerouting: boolean;
  insets: EdgeInsets;
  getManeuverIcon: (maneuver?: string) => string;
  status: string;
  connection: string;
  duration: string;
  distance: string;
  active: boolean;
  onExit: () => void;
  onSos: () => void;
  assistanceEnabled: boolean;
}

/** No invented traffic/speed data; retain the route engine's actual instructions. */
export function DriverNavigationGuidance({ step, nextStep, loading, rerouting, insets, getManeuverIcon,
  status, connection, duration, distance, active, onExit, onSos, assistanceEnabled }: Props) {
  const { height, fontScale } = useWindowDimensions();
  const layout = getDriverNavigationLayout(height, insets.top, insets.bottom, fontScale);
  return <View testID="driver-navigation-guidance" style={[styles.card, {
    top: layout.guidanceTop, maxHeight: layout.guidanceMaxHeight,
    left: Math.max(12, insets.left), right: Math.max(12, insets.right),
  }]}>
    <View style={styles.header}>
      <TouchableOpacity style={styles.back} onPress={() => { if (active) onExit(); }} disabled={!active}
        accessibilityRole="button" accessibilityLabel="Retour au trajet"
        accessibilityHint="Le trajet continue. Ce bouton ne l’arrête pas.">
        <Ionicons name="arrow-back" size={23} color={Colors.white} />
      </TouchableOpacity>
      <View style={styles.statusRow}>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.connection}>{connection}</Text>
      </View>
      <TouchableOpacity style={styles.sos} disabled={!active || !assistanceEnabled}
        accessibilityRole="button" accessibilityLabel="SOS : afficher les numéros d’urgence"
        accessibilityHint="Aucun appel n’est lancé avant votre choix."
        onPress={() => { if (active && assistanceEnabled) onSos(); }}>
        <Text style={styles.sosLabel}>SOS</Text>
      </TouchableOpacity>
    </View>
    <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
      {loading ? <View style={styles.row}>
        <ActivityIndicator color={Colors.white} />
        <Text style={styles.loading}>{rerouting ? 'Recalcul de l’itinéraire…' : 'Calcul de l’itinéraire…'}</Text>
      </View> : step && <>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name={getManeuverIcon(step.maneuver) as React.ComponentProps<typeof Ionicons>['name']} size={40} color={Colors.white} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.distance}>{step.distance.text}</Text>
            <Text style={styles.instruction}>{cleanHtmlInstructions(step.html_instructions)}</Text>
          </View>
        </View>
        {nextStep && <Text style={styles.next}>Puis : {cleanHtmlInstructions(nextStep.html_instructions)}</Text>}
      </>}
      {!loading && !step && <Text style={styles.instruction}>{status === 'Trajet en cours' ? 'Guidage indisponible pour le moment' : 'Votre itinéraire sur la carte'}</Text>}
    </ScrollView>
      <View style={styles.metrics}>
        <Ionicons name="navigate-outline" size={14} color="#BCCBDC" />
        <Text style={styles.metric}>{duration} · {distance}</Text>
      </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', borderRadius: 22, backgroundColor: '#10243A', overflow: 'hidden', zIndex: 40 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  back: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between', paddingRight: 10 },
  status: { color: Colors.white, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  connection: { color: '#BCCBDC', fontSize: 11, flexShrink: 1 },
  sos: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sosLabel: { color: '#FFB6AC', fontSize: 12, fontWeight: '800' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  distance: { fontSize: 30, fontWeight: '800', color: Colors.white, fontVariant: ['tabular-nums'] },
  instruction: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: Colors.white },
  next: { fontSize: 12, lineHeight: 17, color: '#BCCBDC' },
  loading: { fontSize: 14, color: Colors.white, flex: 1 },
  metrics: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3D5065', paddingVertical: 8, marginHorizontal: 16 },
  metric: { fontSize: 13, fontWeight: '600', color: '#D9E4EF', flexShrink: 1 },
});
