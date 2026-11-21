import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PassengerNavigationFeedback } from './passengerNavigationAvailability';

type Props = { feedback: PassengerNavigationFeedback; busy: boolean; online: boolean; active: boolean;
  onRetry: () => void; onHome: () => void; onBookings: () => void };

/** Scrollable at large font sizes; no native map, modal, or automatic navigation. */
export function PassengerNavigationUnavailable({ feedback, busy, online, active, onRetry, onHome, onBookings }: Props) {
  const disabled = busy || !online || !active;
  return <SafeAreaView style={s.screen}>
    <ScrollView contentContainerStyle={s.content} bounces={false}>
      <Text style={s.eyebrow}>VOTRE TRAJET</Text>
      <View style={s.icon}><Ionicons name={feedback.icon} size={32} color="#B94313" accessible={false} /></View>
      <Text style={s.title} accessibilityRole="header" accessibilityLiveRegion="polite">{feedback.title}</Text>
      <Text style={s.message}>{feedback.message}</Text>
      {feedback.retry && !online && <Text style={s.hint}>Vous êtes hors connexion.</Text>}
      {feedback.retry ? <TouchableOpacity style={[s.primary, disabled && s.disabled]} accessibilityRole="button"
        accessibilityState={{ disabled, busy }} disabled={disabled} activeOpacity={0.75}
        onPress={() => { if (!disabled) onRetry(); }}>
        <Text style={s.primaryText}>{busy ? 'Vérification…' : 'Réessayer'}</Text>
      </TouchableOpacity> : <TouchableOpacity style={s.primary} accessibilityRole="button" disabled={!active}
        onPress={() => { if (active) onBookings(); }} activeOpacity={0.75}>
        <Text style={s.primaryText}>Mes réservations</Text>
      </TouchableOpacity>}
      <TouchableOpacity style={s.secondary} accessibilityRole="button" disabled={!active}
        onPress={() => { if (active) onHome(); }} activeOpacity={0.75}>
        <Text style={s.secondaryText}>Retour à l’accueil</Text>
      </TouchableOpacity>
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFCF8' },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  eyebrow: { color: '#687080', fontSize: 12, fontWeight: '700', letterSpacing: 1.8 },
  icon: { padding: 16, borderRadius: 24, backgroundColor: '#FFF0E5' },
  title: { color: '#15263E', fontSize: 24, lineHeight: 32, fontWeight: '700', textAlign: 'center', maxWidth: 420 },
  message: { color: '#596273', fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 420 },
  hint: { color: '#596273', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  primary: { backgroundColor: '#BD410D', borderRadius: 18, minHeight: 52, padding: 16, alignSelf: 'stretch', maxWidth: 420, width: '100%', alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
  secondary: { minHeight: 48, padding: 12, justifyContent: 'center' },
  secondaryText: { color: '#596273', fontSize: 15, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
});
