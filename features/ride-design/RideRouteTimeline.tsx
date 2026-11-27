import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { RouteLocationLabels } from '@/utils/routeLocationLabels';
import { rideColors as c } from './rideDesign';

/** Wrapping address/reference labels; never replaces a location with mockup text. */
export function RideRouteTimeline({ labels, departureTime, arrivalTime, arrivalConfirmed = false, outlined = false, children }: {
  labels: RouteLocationLabels; departureTime?: string; arrivalTime?: string;
  arrivalConfirmed?: boolean; outlined?: boolean; children?: React.ReactNode;
}) {
  const large = useWindowDimensions().fontScale > 1.3;
  const arrivalLabel = arrivalConfirmed ? 'Arrivée confirmée' : arrivalTime ? 'Arrivée estimée' : 'Destination';
  return <View style={outlined && s.outline}>
    <View style={s.route}>
      <View style={s.line} pointerEvents="none" />
      {(['departure', 'arrival'] as const).map(key => {
        const stop = labels[key];
        const time = key === 'departure' ? departureTime : arrivalTime;
        return <View key={key} style={s.stop} accessible
          accessibilityLabel={[key === 'departure' ? 'Départ' : arrivalLabel, stop.title, stop.context,
            stop.reference && `Référence : ${stop.reference}`, time].filter(Boolean).join('. ')}>
          <View style={[s.dot, key === 'arrival' && s.arrival]} />
          <View style={s.copy}>
            <Text style={s.label}>{key === 'departure' ? 'Départ' : arrivalLabel}</Text>
            <View style={[s.heading, large && s.stack]}>
              <Text style={s.title}>{stop.title}</Text>
              {!!time && <Text style={s.time}>{time}</Text>}
            </View>
            {!!stop.context && <Text style={s.context}>{stop.context}</Text>}
            {!!stop.reference && <Text style={s.context}>Réf. : {stop.reference}</Text>}
          </View>
        </View>;
      })}
    </View>
    {children && <View style={s.facts}>{children}</View>}
  </View>;
}

const s = StyleSheet.create({
  outline: { borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16 },
  route: { gap: 16 },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  copy: { flex: 1, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  stack: { flexDirection: 'column', gap: 2 },
  label: { color: c.muted, fontSize: 12, lineHeight: 18, marginBottom: 2 },
  title: { flex: 1, color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  time: { color: c.ink, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  context: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.green, marginTop: 5 },
  arrival: { borderRadius: 2, backgroundColor: c.orange },
  line: { position: 'absolute', top: 18, bottom: 18, left: 4, width: 2, backgroundColor: '#D8DDD9' },
  facts: { borderTopWidth: 1, borderColor: c.line, marginTop: 12, paddingTop: 10 },
});
