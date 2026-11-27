import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/styles';

export const compactBookingStyles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 12 },
  routePanel: { borderWidth: 1, borderColor: '#E3E6ED', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  routeSeparator: { height: 1, backgroundColor: '#E3E6ED', marginLeft: 26 },
  routeDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#199652' },
  arrivalDot: { borderRadius: 3, backgroundColor: '#D54100' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#F2F4F7' },
  title: { flex: 1, fontSize: 24, lineHeight: 30, fontWeight: '800', color: '#111827' },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, gap: 14, backgroundColor: '#FFFFFF' },
  totalRow: { borderTopWidth: 1, borderColor: '#E3E6ED', paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalStack: { flexDirection: 'column', alignItems: 'stretch' },
  button: { minHeight: 56, borderRadius: 30, backgroundColor: '#D54100', paddingHorizontal: 16, paddingVertical: 15, justifyContent: 'center', alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, lineHeight: 23, textAlign: 'center', fontWeight: '700' },
  footnote: { color: '#5E697B', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 48 },
  copy: { flex: 1, minWidth: 0 }, value: { fontSize: 17, color: '#111827', fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  input: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], color: Colors.gray[900], marginBottom: 8 },
  seats: { textAlign: 'center', minWidth: 40, maxWidth: 64, minHeight: 48, fontSize: 22, fontWeight: '700', color: '#111827' },
  stepper: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.gray[100] },
  plus: { backgroundColor: '#FFE5D6' },
  price: { flexShrink: 1, fontSize: 27, fontWeight: '800', color: '#111827' },
  error: { color: Colors.dangerDark, fontSize: 14 }, disabled: { opacity: 0.5 },
});
