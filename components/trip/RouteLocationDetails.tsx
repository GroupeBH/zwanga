import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/styles';
import type { RouteLocationLabels, RouteStopLabel } from '@/utils/routeLocationLabels';

type Props = {
  labels: RouteLocationLabels; tone?: 'light' | 'dark'; trailingInset?: number;
  compact?: boolean; departureTimeLabel?: string; arrivalTimeLabel?: string;
};

function Stop({ label, stop, arrival = false, dark, compact, time }: {
  label: string; stop: RouteStopLabel; arrival?: boolean; dark: boolean; compact?: boolean; time?: string;
}) {
  const timeLabel = time ? `${arrival ? 'Arrivée estimée' : 'Départ'} : ${time}` : '';
  const accessibilityLabel = [label, stop.title, stop.context, stop.reference && `Repère : ${stop.reference}`, timeLabel].filter(Boolean).join('. ');
  return (
    <View style={[styles.stop, compact && styles.compactStop]} accessible accessibilityLabel={accessibilityLabel}>
      <View style={[styles.dot, arrival && styles.arrivalDot]} />
      <View style={styles.copy}>
        <View style={styles.heading}>
          <Text style={[styles.label, dark && styles.darkLabel]}>{arrival && time ? 'Arrivée estimée' : label}</Text>
          {!!time && <Text style={[styles.time, dark && styles.darkLabel]}>{time}</Text>}
        </View>
        <Text style={[styles.title, dark && styles.darkTitle]}>{stop.title}</Text>
        {!!stop.context && <Text style={[styles.context, dark && styles.darkContext]}>{stop.context}</Text>}
        {!!stop.reference && <Text style={[styles.reference, dark && styles.darkReference]}>Repère : {stop.reference}</Text>}
      </View>
    </View>
  );
}

/** Shared, wrapping route labels for driver/passenger trip and request details. */
export const RouteLocationDetails = memo(function RouteLocationDetails({
  labels, tone = 'light', trailingInset = 0, compact = false, departureTimeLabel, arrivalTimeLabel,
}: Props) {
  const dark = tone === 'dark';
  return (
    <View style={[styles.container, { paddingRight: trailingInset }]}>
      <Stop label="Départ" stop={labels.departure} dark={dark} compact={compact} time={departureTimeLabel} />
      <View style={[styles.divider, compact && styles.compactDivider, dark && styles.darkDivider]} />
      <Stop label="Destination" stop={labels.arrival} arrival dark={dark} compact={compact} time={arrivalTimeLabel} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  compactStop: { gap: 8, paddingVertical: 4 },
  compactDivider: { marginVertical: 1 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 8, rowGap: 2 },
  time: { flexShrink: 1, fontSize: 12, fontWeight: '500', color: Colors.gray[600] },
  dot: { width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: Colors.success },
  arrivalDot: { borderRadius: 2, backgroundColor: Colors.primary },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.gray[600] },
  title: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  context: { fontSize: 13, color: Colors.gray[600] },
  reference: { fontSize: 13, fontWeight: '500', color: Colors.gray[700] },
  darkLabel: { color: Colors.gray[300] },
  darkTitle: { color: Colors.white },
  darkContext: { color: Colors.gray[400] },
  darkReference: { color: Colors.primaryLight },
  darkDivider: { backgroundColor: Colors.gray[700] },
  divider: { marginLeft: 18, marginVertical: 3, height: StyleSheet.hairlineWidth, backgroundColor: Colors.gray[200] },
});
