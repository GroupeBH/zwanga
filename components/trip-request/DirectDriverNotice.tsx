import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { useDirectDriverPrefill } from '@/hooks/trip-request/useDirectDriverPrefill';
import type { SelectedRequestDriver } from '@/store/api/requestDriverApi';

export function DirectDriverNotice({ prefill, driver, disabled }: { prefill: ReturnType<typeof useDirectDriverPrefill>; driver: SelectedRequestDriver | null; disabled: boolean }) {
  if (!prefill.blocked && !driver) return null;
  return <View style={s.section}>
    <Text style={s.title}>{driver ? `Demande pour ${driver.name}` : prefill.error ? 'Conducteur indisponible' : 'Chargement du conducteur…'}</Text>
    <Text style={s.hint}>{driver ? 'Indiquez votre trajet. Le conducteur devra confirmer sa disponibilité.' :
      prefill.error ? 'Réessayez ou choisissez les conducteurs proches.' : 'Votre demande ne sera pas envoyée à un autre conducteur sans votre choix.'}</Text>
    {prefill.blocked && !prefill.error && <ActivityIndicator color="#CE4613" />}
    <View style={s.actions}>
      {prefill.error && <Pressable accessibilityRole="button" disabled={disabled} onPress={prefill.retry} style={s.link}><Text style={s.text}>Réessayer</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={disabled} onPress={prefill.dismiss} style={s.link}><Text style={s.text}>Choisir les conducteurs proches</Text></Pressable>
    </View>
  </View>;
}
const s = StyleSheet.create({ section: { paddingVertical: 12, gap: 6 }, title: { fontSize: 16, fontWeight: '700', color: '#1C2433' },
  hint: { color: '#536071', fontSize: 13, lineHeight: 19 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  link: { minHeight: 44, justifyContent: 'center' }, text: { color: '#BA3E0F', fontWeight: '600' } });
