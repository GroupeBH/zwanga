import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavigationContact } from './navigationContacts';

interface Props { contacts: NavigationContact[]; role: 'driver' | 'passenger'; onClose: () => void }

export function NavigationContactModal({ contacts, role, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const contact = async (person: NavigationContact, channel: 'phone' | 'whatsapp') => {
    if (!person.phone || busyRef.current) return;
    busyRef.current = true;
    setBusy(`${person.id}:${channel}`); setError(null);
    const fail = (message: string) => { if (mounted.current) setError(message); };
    try {
      await (channel === 'phone' ? openPhoneCall : openWhatsApp)(person.phone, fail);
    } catch {
      fail('Impossible d’ouvrir ce moyen de contact. Réessayez ou utilisez l’autre bouton.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  return <FormModal visible transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer les contacts" accessibilityRole="button" />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <Text style={styles.title}>{role === 'driver' ? 'Contacter un passager' : 'Contacter le conducteur'}</Text>
            <Text style={styles.hint}>{role === 'driver' ? 'Choisissez la personne à joindre. Utilisez ces actions uniquement à l’arrêt.' : 'Choisissez comment joindre votre conducteur.'}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer les contacts">
            <Ionicons name="close" size={24} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {contacts.length === 0 && <Text style={styles.hint}>Aucun passager à contacter pour le moment.</Text>}
          {contacts.map(person => <View key={person.id} style={styles.person}>
            <Text style={styles.name}>{person.name}</Text>
            <Text style={styles.hint}>{person.detail}</Text>
            {!person.phone && <Text style={styles.hint}>Le numéro de téléphone n’est pas disponible.</Text>}
            <View style={styles.actions}>
              {(['phone', 'whatsapp'] as const).map(channel => <TouchableOpacity key={channel}
                onPress={() => void contact(person, channel)} disabled={!person.phone || busy !== null}
                accessibilityRole="button" accessibilityLabel={`${channel === 'phone' ? 'Appeler' : 'Contacter sur WhatsApp'} ${person.name}`}
                style={[styles.action, channel === 'whatsapp' && styles.whatsapp, (!person.phone || busy !== null) && styles.disabled]}>
                {busy === `${person.id}:${channel}` ? <ActivityIndicator color={Colors.primaryDark} /> :
                  <Ionicons name={channel === 'phone' ? 'call-outline' : 'logo-whatsapp'} size={21} color={channel === 'phone' ? Colors.primaryDark : '#128C7E'} />}
                <Text style={styles.actionLabel}>{channel === 'phone' ? 'Appeler' : 'WhatsApp'}</Text>
              </TouchableOpacity>)}
            </View>
          </View>)}
          {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
          <Text style={styles.hint}>L’appel utilise le réseau téléphonique. WhatsApp nécessite une connexion Internet.</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  </FormModal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,20,30,0.45)' },
  sheet: { maxHeight: '85%', backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  copy: { flex: 1, minWidth: 0 }, title: { fontSize: 22, fontWeight: '700', color: Colors.gray[900] },
  hint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600], marginTop: 5 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.gray[100] },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  person: { paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.gray[100] },
  name: { fontSize: 17, fontWeight: '700', color: Colors.gray[900] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  action: { flexGrow: 1, minHeight: 48, flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF4EC' },
  whatsapp: { backgroundColor: '#EAF8F0' }, actionLabel: { fontSize: 14, fontWeight: '700', color: Colors.gray[800] },
  disabled: { opacity: 0.45 }, error: { color: Colors.dangerDark, fontSize: 14, lineHeight: 20 },
});
