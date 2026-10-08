import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
}

/** One compact instruction; long road names remain readable by scrolling, not truncated. */
export function DriverNavigationGuidance({ step, nextStep, loading, rerouting, insets, getManeuverIcon }: Props) {
  const { height } = useWindowDimensions();
  const layout = getDriverNavigationLayout(height, insets.top, insets.bottom);
  if (!loading && !step) return null;
  return <View style={[styles.card, {
    bottom: layout.guidanceBottom, maxHeight: layout.guidanceMaxHeight,
    left: Math.max(12, insets.left), right: Math.max(12, insets.right),
  }]}>
    <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
      {loading ? <View style={styles.row}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.loading}>{rerouting ? 'Recalcul de l’itinéraire…' : 'Calcul de l’itinéraire…'}</Text>
      </View> : step && <>
        <View style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name={getManeuverIcon(step.maneuver) as React.ComponentProps<typeof Ionicons>['name']} size={28} color={Colors.white} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.distance}>{step.distance.text}</Text>
            <Text style={styles.instruction}>{cleanHtmlInstructions(step.html_instructions)}</Text>
          </View>
        </View>
        {nextStep && <Text style={styles.next}>Puis : {cleanHtmlInstructions(nextStep.html_instructions)}</Text>}
      </>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  card: { position: 'absolute', borderRadius: 18, backgroundColor: Colors.white, overflow: 'hidden',
    shadowColor: Colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 5, elevation: 4 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  distance: { fontSize: 14, fontWeight: '800', color: Colors.primaryDark },
  instruction: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: Colors.gray[900] },
  next: { fontSize: 12, lineHeight: 17, color: Colors.gray[600] },
  loading: { fontSize: 14, color: Colors.gray[700], flex: 1 },
});
