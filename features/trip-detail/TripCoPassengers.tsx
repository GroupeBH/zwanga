import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideColors as c } from '@/features/ride-design/rideDesign';
import { useTripCoPassengers } from '@/hooks/trip-detail/useTripCoPassengers';
import type { Booking, Trip } from '@/types';
import { CoPassengerList } from './CoPassengerList';
import { useCoPassengerActions } from '@/hooks/trip-detail/useCoPassengerActions';

export function TripCoPassengers({ trip, booking, active }: { trip?: Trip; booking: Booking | null; active: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const roster = useTripCoPassengers(trip, booking, active, expanded);
  const actions = useCoPassengerActions(roster, () => setExpanded(false));
  if (!roster.eligible) return null;
  return <View style={s.section}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Autres passagers"
      accessibilityState={{ expanded }} style={s.heading} onPress={() => setExpanded(value => !value)}>
      <Ionicons name="people-outline" size={22} color={c.ink} />
      <View style={s.copy}><Text style={s.title}>Autres passagers</Text>
        <Text style={s.hint}>Réservations confirmées</Text></View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
    </TouchableOpacity>
    {expanded && active && <View style={s.content}>
      <CoPassengerList roster={roster} actions={actions} />
    </View>}
  </View>;
}

const s = StyleSheet.create({
  section: { marginHorizontal: 16, marginBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 12 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: c.ink, fontSize: 16, fontWeight: '700', lineHeight: 23 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  content: { paddingBottom: 8, gap: 10 },
});
