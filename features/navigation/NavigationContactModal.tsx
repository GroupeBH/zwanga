import { FormModal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { useContactMessaging } from '@/hooks/navigation/useTripContactMessaging';
import { useIsFocused } from '@react-navigation/native';
import { openPhoneCall, openWhatsApp } from '@/utils/phoneHelpers';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NavigationContact } from './navigationContacts';

interface Props { contacts: NavigationContact[]; role: 'driver' | 'passenger'; onClose: () => void; allowPhoneCall?: boolean }

export function NavigationContactModal(props: Props) {
  const active = useIsFocused();
  return <ContactModalContent {...props} active={active} />;
}

export function ContactModalContent({ contacts, role, onClose, allowPhoneCall = true, active, title, hint, closeLabel,
  loading = false, loadError, onRetry }: Props & {
  active: boolean; title?: string; hint?: string; closeLabel?: string;
  loading?: boolean; loadError?: string; onRetry?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const messaging = useContactMessaging(contacts, onClose, active);
  const close = () => { messaging.cancel(); onClose(); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const contact = async (person: NavigationContact, channel: 'phone' | 'whatsapp' | 'message') => {
    if (busyRef.current || (channel !== 'message' && !person.phone) ||
      (channel === 'message' && (!messaging.canMessage || person.id === messaging.userId))) return;
    busyRef.current = true;
    setBusy(`${person.id}:${channel}`); setError(null);
    const fail = (message: string) => { if (mounted.current) setError(message); };
    try {
      if (channel === 'message') await messaging.openMessage(person);
      else await (channel === 'phone' ? openPhoneCall : openWhatsApp)(person.phone!, fail);
    } catch {
      fail(channel === 'message' ? 'Impossible d’ouvrir la messagerie. Vérifiez votre connexion et réessayez.' :
        'Impossible d’ouvrir ce moyen de contact. Réessayez ou utilisez l’autre bouton.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(null);
    }
  };
  return <FormModal inApp visible transparent animationType="slide" statusBarTranslucent presentationStyle="overFullScreen" onRequestClose={close}>
    <View style={styles.overlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Fermer les contacts" accessibilityRole="button" />
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.copy}>
            <Text style={styles.title}>{title ?? (role === 'driver' ? 'Contacter un passager' : 'Contacter le conducteur')}</Text>
            <Text style={styles.hint}>{hint ?? (role === 'driver' ? 'Choisissez la personne à joindre. Utilisez ces actions uniquement à l’arrêt.' : 'Choisissez comment joindre votre conducteur.')}</Text>
          </View>
          <TouchableOpacity onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Fermer les contacts">
            <Ionicons name="close" size={24} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loading && <ActivityIndicator color={Colors.primary} accessibilityLabel="Chargement du contact" />}
          {loadError && <>
            <Text style={styles.error} accessibilityRole="alert">{loadError}</Text>
            <TouchableOpacity onPress={onRetry} style={styles.action} accessibilityRole="button">
              <Text style={styles.actionLabel}>Réessayer</Text>
            </TouchableOpacity>
          </>}
          {!loading && !loadError && contacts.length === 0 && <Text style={styles.hint}>Aucun contact disponible pour ce trajet.</Text>}
          {contacts.map(person => <View key={person.id} style={styles.person}>
            <Text style={styles.name}>{person.name}</Text>
            <Text style={styles.hint}>{person.detail}</Text>
            <TouchableOpacity onPress={() => void contact(person, 'message')}
              disabled={busy !== null || !messaging.canMessage || person.id === messaging.userId}
              accessibilityRole="button" accessibilityLabel={`Envoyer un message dans Zwanga à ${person.name}`}
              accessibilityState={{ disabled: busy !== null || !messaging.canMessage || person.id === messaging.userId,
                busy: busy === `${person.id}:message` }}
              style={[styles.message, (busy !== null || !messaging.canMessage || person.id === messaging.userId) && styles.disabled]}>
              {busy === `${person.id}:message` ? <ActivityIndicator color={Colors.white} /> :
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={Colors.white} />}
              <View style={styles.copy}>
                <Text style={styles.messageLabel}>{busy === `${person.id}:message` ? 'Ouverture…' : 'Message dans Zwanga'}</Text>
                <Text style={styles.messageHint}>Échangez sans quitter l’application</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.white} />
            </TouchableOpacity>
            {!person.phone && <Text style={styles.hint}>Numéro indisponible : utilisez la messagerie Zwanga.</Text>}
            <View style={styles.actions}>
              {(allowPhoneCall ? ['phone', 'whatsapp'] as const : ['whatsapp'] as const).map(channel => <TouchableOpacity key={channel}
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
          <Text style={styles.hint}>{allowPhoneCall ? 'L’appel utilise le réseau téléphonique. ' : ''}La messagerie Zwanga et WhatsApp nécessitent Internet.</Text>
          {closeLabel && <TouchableOpacity onPress={close} style={styles.action} accessibilityRole="button">
            <Text style={styles.actionLabel}>{closeLabel}</Text>
          </TouchableOpacity>}
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
  message: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 14, minHeight: 56, borderRadius: 14, backgroundColor: Colors.primaryDark },
  messageLabel: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  messageHint: { color: Colors.white, fontSize: 12, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  action: { flexGrow: 1, minHeight: 48, flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF4EC' },
  whatsapp: { backgroundColor: '#EAF8F0' }, actionLabel: { fontSize: 14, fontWeight: '700', color: Colors.gray[800] },
  disabled: { opacity: 0.45 }, error: { color: Colors.dangerDark, fontSize: 14, lineHeight: 20 },
});
