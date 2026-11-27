import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rideColors as c } from '@/features/ride-design/rideDesign';
import type { useTripCoPassengers } from '@/hooks/trip-detail/useTripCoPassengers';
import type { useCoPassengerActions } from '@/hooks/trip-detail/useCoPassengerActions';

/** Public identities and in-app messages; no phone number or private booking details. */
export function CoPassengerList({ roster, actions }: { roster: ReturnType<typeof useTripCoPassengers>;
  actions?: ReturnType<typeof useCoPassengerActions> }) {
  if (!roster.online) return <Text style={s.hint}>Reconnectez-vous pour voir les passagers.</Text>;
  if (roster.denied) return <Text style={s.hint}>Liste réservée aux passagers confirmés de ce trajet.</Text>;
  if (roster.failed) return <View style={s.row}>
    <Text style={[s.hint, s.copy]}>Liste indisponible pour le moment.</Text>
    <TouchableOpacity accessibilityRole="button" onPress={() => { void roster.refresh(); }} style={s.retry}>
      <Text style={s.link}>Réessayer</Text>
    </TouchableOpacity>
  </View>;
  if (roster.loading) return <View style={s.row}><ActivityIndicator color={c.orange} /><Text style={s.hint}>Chargement des passagers…</Text></View>;
  if (!roster.participants) return null;
  return <>
    {roster.participants.length === 0 && <Text style={s.hint}>Aucun autre passager confirmé pour le moment.</Text>}
    {roster.participants.map(person => <View key={person.id} style={s.person}>
      <TouchableOpacity style={s.profile} disabled={!person.userId || !actions || actions.busy}
        accessibilityRole="button" accessibilityLabel={`Voir le profil de ${person.firstName}`}
        onPress={() => actions?.profile(person)}>
      {person.avatarUrl ? <Image source={{ uri: person.avatarUrl }} style={s.avatar} resizeMethod="resize" accessible={false} />
        : <View style={[s.avatar, s.placeholder]}><Text style={s.initial}>{Array.from(person.firstName.trim())[0]?.toUpperCase() || 'P'}</Text></View>}
      <View style={s.copy}><Text style={s.name}>{person.firstName}</Text>
        <Text style={s.hint}>{person.seats} place{person.seats > 1 ? 's' : ''} réservée{person.seats > 1 ? 's' : ''}{person.userId ? ' · Voir le profil' : ''}</Text></View>
      </TouchableOpacity>
      {person.userId && actions && <TouchableOpacity style={s.message} disabled={actions.busy}
        accessibilityRole="button" accessibilityLabel={`Écrire à ${person.firstName}`} accessibilityState={{ disabled: actions.busy }}
        onPress={() => { void actions.message(person); }}>
        <Ionicons name="chatbubble-outline" size={22} color={c.orange} />
      </TouchableOpacity>}
    </View>)}
    {!!actions?.error && <Text style={s.hint} accessibilityRole="alert">{actions.error}</Text>}
    <TouchableOpacity accessibilityRole="button" style={s.refresh} disabled={roster.busy}
      accessibilityState={{ disabled: roster.busy }} onPress={() => { void roster.refresh(); }}>
      <Ionicons name="refresh-outline" size={16} color={c.orange} /><Text style={s.link}>Actualiser</Text>
    </TouchableOpacity>
  </>;
}

const s = StyleSheet.create({
  copy: { flex: 1, minWidth: 0 },
  hint: { color: c.muted, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  profile: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  message: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.peach, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  placeholder: { backgroundColor: c.peach, justifyContent: 'center', alignItems: 'center' },
  initial: { color: c.orange, fontSize: 17, fontWeight: '700' },
  name: { color: c.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  link: { color: c.orange, fontSize: 13, fontWeight: '600', lineHeight: 20 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  refresh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
});
