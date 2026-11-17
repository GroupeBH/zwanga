import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/styles';
import { ACTION_COLORS } from '@/constants/actionColors';

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.white },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '700', color: Colors.gray[900], flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 16, alignItems: 'center' },
  name: { color: Colors.gray[900], fontSize: 23, fontWeight: '700', textAlign: 'center' },
  hint: { color: Colors.gray[600], fontSize: 15, lineHeight: 22, textAlign: 'center' },
  qr: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  action: { width: '100%', minHeight: 50, padding: 14, borderRadius: 16, backgroundColor: ACTION_COLORS.orange, alignItems: 'center' },
  actionText: { color: Colors.white, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  secondary: { minHeight: 48, padding: 12, justifyContent: 'center' },
  link: { fontSize: 16, color: ACTION_COLORS.orange, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  detail: { width: '100%', borderTopWidth: 1, borderTopColor: Colors.gray[200], paddingTop: 18, gap: 10 },
  sectionTitle: { color: Colors.gray[900], fontWeight: '700', fontSize: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { color: Colors.gray[700], fontSize: 15 },
  status: { fontSize: 14, color: '#9A3B08', backgroundColor: '#FFF0E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  settled: { color: '#166342', backgroundColor: '#E8F5EF' },
});
