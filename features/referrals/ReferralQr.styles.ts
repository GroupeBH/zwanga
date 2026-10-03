import { StyleSheet } from 'react-native';
import { Colors, FontWeights } from '@/constants/styles';

export const styles = StyleSheet.create({
  entry: { marginTop: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
    backgroundColor: Colors.white, flexDirection: 'row', alignItems: 'center', gap: 10 },
  entryText: { flex: 1, color: Colors.primaryDark, fontSize: 15, fontWeight: FontWeights.bold },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.52)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 400, maxHeight: '100%', borderRadius: 24, backgroundColor: Colors.white, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 24, paddingRight: 12, paddingTop: 12 },
  brand: { flex: 1, fontSize: 24, fontWeight: FontWeights.bold, color: Colors.primary },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  title: { fontSize: 22, fontWeight: FontWeights.bold, color: Colors.gray[900], textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, color: Colors.gray[600], textAlign: 'center', marginTop: 8 },
  qr: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', marginTop: 12 },
  code: { fontSize: 14, color: Colors.gray[700], textAlign: 'center', marginTop: 4 },
  codeValue: { fontWeight: FontWeights.bold, letterSpacing: 1 },
  placeholder: { minHeight: 240, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  feedback: { fontSize: 13, lineHeight: 19, color: Colors.gray[700], textAlign: 'center', marginTop: 12 },
  error: { color: Colors.dangerDark },
  footer: { paddingHorizontal: 20, paddingBottom: 16, gap: 6 },
  primary: { minHeight: 50, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14, backgroundColor: Colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { color: Colors.white, fontSize: 15, fontWeight: FontWeights.bold, textAlign: 'center', flexShrink: 1 },
  secondary: { minHeight: 46, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: Colors.gray[700], fontSize: 14, fontWeight: FontWeights.semibold, textAlign: 'center' },
  disabled: { opacity: 0.55 },
});
