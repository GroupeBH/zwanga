import { StyleSheet } from 'react-native';

export const ALERT_SETTINGS_INK = '#1D2949';
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  title: { flex: 1, fontSize: 21, lineHeight: 28, fontWeight: '700', color: ALERT_SETTINGS_INK },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  intro: { fontSize: 15, lineHeight: 22, color: '#596579', marginBottom: 18 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#F3F5F8' },
  summaryCopy: { flex: 1, minWidth: 0, gap: 4 },
  summaryTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: ALERT_SETTINGS_INK },
  copy: { fontSize: 14, lineHeight: 21, color: '#596579' },
  section: { paddingVertical: 20, gap: 22, borderBottomWidth: 1, borderBottomColor: '#ECEEF1' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  rowIcon: { width: 36, alignItems: 'center' },
  label: { flexShrink: 1, fontSize: 16, lineHeight: 22, fontWeight: '600', color: ALERT_SETTINGS_INK },
  retry: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 15, fontWeight: '600', color: '#BE3E08' },
  more: { minHeight: 56, flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  details: { gap: 12 },
});
