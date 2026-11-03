import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/styles';
import { ACTION_COLORS } from '@/constants/actionColors';

export const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { width: '100%', maxWidth: 420, maxHeight: '100%', backgroundColor: Colors.white, borderRadius: 24, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: 24, gap: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#287052', fontWeight: '600' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: Colors.gray[900] },
  message: { fontSize: 16, lineHeight: 23, color: Colors.gray[700] },
  error: { fontSize: 14, lineHeight: 20, color: Colors.dangerDark },
  primaryButton: { minHeight: 52, padding: 14, backgroundColor: ACTION_COLORS.orange, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { flexShrink: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: Colors.white },
  secondaryButton: { minHeight: 44, padding: 10, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 16, color: Colors.gray[700], textAlign: 'center', fontWeight: '600' },
});
