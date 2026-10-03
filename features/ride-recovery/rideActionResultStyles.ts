import { StyleSheet } from 'react-native';

export const resultTones = {
  success: { accent: '#147D58', soft: '#EBF8F1' },
  pending: { accent: '#B74A20', soft: '#FFF3EB' },
  danger: { accent: '#BE3546', soft: '#FFF0F2' },
};

export const resultStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(13, 24, 37, 0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  card: { width: '100%', maxWidth: 410, maxHeight: '94%', borderRadius: 28, backgroundColor: '#FFFFFF', overflow: 'hidden',
    shadowColor: '#0D1825', shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 10, paddingTop: 8 },
  stage: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flexShrink: 1, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 22 },
  halo: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  iconDisc: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#16232F', fontSize: 25, lineHeight: 31, fontWeight: '800', textAlign: 'center' },
  message: { color: '#52616E', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12 },
  status: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, marginTop: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  reservation: { color: '#73808A', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 14 },
  footer: { flexShrink: 0, padding: 20, paddingTop: 0 },
  primary: { minHeight: 52, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { flexShrink: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
