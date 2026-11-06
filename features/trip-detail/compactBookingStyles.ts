import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/styles';

export const compactBookingStyles = StyleSheet.create({
  content: { gap: 8, paddingBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 48 },
  copy: { flex: 1 }, value: { fontSize: 15, color: Colors.gray[900], fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  input: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[300], color: Colors.gray[900], marginBottom: 8 },
  seats: { textAlign: 'center', minWidth: 40, minHeight: 48, fontSize: 18, color: Colors.gray[900] },
  stepper: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: Colors.gray[100] },
  price: { fontSize: 22, fontWeight: '700', color: Colors.gray[900] },
  error: { color: Colors.dangerDark, fontSize: 14 }, disabled: { opacity: 0.5 },
});
