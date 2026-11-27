import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useAppSelector } from '@/store/hooks';
import { useGetPublicMemberQuery } from '@/store/api/publicMemberApi';
import { displayReadOptions, useDisplayRefetch } from '@/hooks/useDisplayReads';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useContactMessaging } from '@/hooks/navigation/useTripContactMessaging';
import { routeUuid } from '@/features/trip-request/directDriverRequest';
import { rideColors as c } from '@/features/ride-design/rideDesign';

const noop = () => {};
export default function PublicMemberScreen() {
  const params = useLocalSearchParams();
  const viewerId = useAppSelector(s => s.auth.user?.id) ?? '';
  const id = routeUuid(params.id) ?? '';
  const session = getTokenSessionVersion();
  return <PublicMemberContent key={`${viewerId}:${session}:${id}`} id={id} viewerId={viewerId} session={session} />;
}

export function PublicMemberContent({ id, viewerId, session }: { id: string; viewerId: string; session: number }) {
  const router = useRouter();
  const active = useScreenIsActive();
  const online = useAppSelector(s => s.zwangaApi.config.online);
  const enabled = Boolean(active && online && viewerId && id);
  const read = useGetPublicMemberQuery({ id, viewerId, session }, displayReadOptions(enabled));
  const refresh = useDisplayRefetch(enabled, `${viewerId}:${session}:${id}`, read.refetch);
  const profile = enabled && !read.isError && !read.isFetching && read.currentData?.id === id ? read.currentData : undefined;
  const name = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Membre Zwanga' : '';
  const contacts = profile ? [{ id, name, phone: null, detail: 'Profil public' }] : [];
  const messages = useContactMessaging(contacts, noop, Boolean(profile));
  const [error, setError] = useState('');
  const memberSince = profile?.createdAt ? new Date(profile.createdAt) : null;
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  return <SafeAreaView style={s.page}>
    <View style={s.header}>
      <TouchableOpacity style={s.icon} accessibilityRole="button" accessibilityLabel="Retour" onPress={goBack}>
        <Ionicons name="arrow-back" size={24} color={c.ink} />
      </TouchableOpacity><Text style={s.title}>Profil public</Text>
    </View>
    <ScrollView contentContainerStyle={s.content}>
      {!profile ? <View style={s.state}>
        {enabled && read.isFetching && <ActivityIndicator color={c.orange} />}
        <Text style={s.hint}>{!online ? 'Reconnectez-vous pour voir ce profil.' : read.isFetching ? 'Chargement du profil…' : 'Ce profil est indisponible pour le moment.'}</Text>
        {enabled && !read.isFetching && <TouchableOpacity accessibilityRole="button" style={s.button} onPress={() => { void refresh(); }}><Text style={s.buttonText}>Réessayer</Text></TouchableOpacity>}
      </View> : <>
        <View style={s.identity}>
          {profile.profilePicture ? <Image source={{ uri: profile.profilePicture }} style={s.avatar} /> :
            <View style={[s.avatar, s.placeholder]}><Text style={s.initial}>{Array.from(name)[0]}</Text></View>}
          <Text style={s.name}>{name}</Text>
          <Text style={s.hint}>{profile.role === 'driver' ? 'Conducteur et passager' : 'Passager'}</Text>
          {memberSince && Number.isFinite(memberSince.getTime()) && <Text style={s.hint}>Membre depuis {memberSince.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</Text>}
        </View>
        <View style={s.facts}>
          <Ionicons name="star-outline" size={22} color={c.orange} />
          <Text style={s.fact}>{profile.totalRatings > 0 && profile.averageRating != null ? `${profile.averageRating.toFixed(1)} / 5 · ${profile.totalRatings} avis` : 'Pas encore d’avis'}</Text>
        </View>
        <View style={s.facts}><Ionicons name="car-outline" size={22} color={c.ink} /><Text style={s.fact}>{profile.passengerBookings} réservation{profile.passengerBookings > 1 ? 's' : ''} comme passager</Text></View>
        {profile.isPhoneVerified && <View style={s.facts}><Ionicons name="shield-checkmark-outline" size={22} color={c.ink} /><Text style={s.fact}>Téléphone vérifié</Text></View>}
        {viewerId !== id && <TouchableOpacity accessibilityRole="button" disabled={messages.isOpeningConversation}
          accessibilityState={{ disabled: messages.isOpeningConversation }} style={s.button}
          onPress={() => { setError(''); void messages.openMessage(contacts[0]).catch(() => setError('Messagerie indisponible. Réessayez.')); }}>
          <Ionicons name="chatbubble-outline" size={21} color="#fff" />
          <Text style={s.buttonText}>{messages.isOpeningConversation ? 'Ouverture…' : 'Écrire dans Zwanga'}</Text>
        </TouchableOpacity>}
        {!!error && <Text accessibilityRole="alert" style={s.hint}>{error}</Text>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  icon: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, title: { fontSize: 20, fontWeight: '700', color: c.ink },
  content: { padding: 24, gap: 16 }, state: { gap: 16, paddingVertical: 24 }, identity: { alignItems: 'center', gap: 8, marginBottom: 16 },
  avatar: { width: 88, height: 88, borderRadius: 44 }, placeholder: { backgroundColor: c.peach, justifyContent: 'center', alignItems: 'center' },
  initial: { color: c.orange, fontSize: 32, fontWeight: '700' }, name: { color: c.ink, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  hint: { color: c.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' }, facts: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  fact: { flex: 1, color: c.ink, fontSize: 16, lineHeight: 24 }, button: { minHeight: 52, borderRadius: 26, padding: 14, backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700', flexShrink: 1 },
});
