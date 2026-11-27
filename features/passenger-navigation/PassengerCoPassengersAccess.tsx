import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RideModal } from '@/features/navigation/RideModal';
import { RIDE_OVERLAY_PRIORITY } from '@/features/navigation/rideOverlayStore';
import { CoPassengerList } from '@/features/trip-detail/CoPassengerList';
import { rideColors as c } from '@/features/ride-design/rideDesign';
import { useTripCoPassengers } from '@/hooks/trip-detail/useTripCoPassengers';
import type { Booking, Trip } from '@/types';
import { useCoPassengerActions } from '@/hooks/trip-detail/useCoPassengerActions';

export function PassengerCoPassengersAccess({ trip, booking, active, blocked = false }: {
  trip?: Trip; booking: Booking | null; active: boolean; blocked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { height } = useWindowDimensions();
  const roster = useTripCoPassengers(trip, booking, active && !blocked, open);
  const actions = useCoPassengerActions(roster, () => setOpen(false));
  const visible = open && active && !blocked && roster.eligible;
  useEffect(() => {
    if (!active || blocked || !roster.eligible) setOpen(false);
  }, [active, blocked, roster.eligible]);
  if (!roster.eligible) return null;
  const close = () => setOpen(false);
  return <>
    <TouchableOpacity style={s.access} accessibilityRole="button" accessibilityLabel="Autres passagers"
      accessibilityState={{ expanded: visible, disabled: !active || blocked }} disabled={!active || blocked}
      onPress={() => setOpen(true)} activeOpacity={0.75}>
      <Ionicons name="people-outline" size={21} color={c.ink} />
      <Text style={s.accessText}>Passagers</Text>
    </TouchableOpacity>
    <RideModal inApp visible={visible} transparent animationType="fade" priority={RIDE_OVERLAY_PRIORITY.information}
      onRequestClose={close}>
      {visible && <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Fermer la liste des passagers" />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.sheet, { maxHeight: height * 0.72 }]}>
          <View style={s.header}>
            <View style={s.copy}><Text accessibilityRole="header" style={s.title}>Autres passagers</Text>
              <Text style={s.hint}>Réservations confirmées</Text></View>
            <TouchableOpacity onPress={close} style={s.close} accessibilityRole="button" accessibilityLabel="Fermer la liste des passagers">
              <Ionicons name="close" size={23} color={c.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator>
            <CoPassengerList roster={roster} actions={actions} />
          </ScrollView>
        </SafeAreaView>
      </View>}
    </RideModal>
  </>;
}

const s = StyleSheet.create({
  access: { alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 44, maxWidth: '38%', paddingHorizontal: 8, paddingVertical: 4 },
  accessText: { color: c.ink, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
  copy: { flex: 1, minWidth: 0 },
  title: { color: c.ink, fontWeight: '700', fontSize: 20 },
  hint: { color: c.muted, fontSize: 13, marginTop: 4 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.pale, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 18, gap: 10 },
});
