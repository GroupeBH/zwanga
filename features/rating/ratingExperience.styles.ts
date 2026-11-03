import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/styles';

export const styles = StyleSheet.create({
  participant: { paddingBottom: 20, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: Colors.gray[200], gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF0E8', alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 22, fontWeight: '700', color: '#A13C17' },
  identityText: { flex: 1, gap: 4 },
  role: { fontSize: 13, color: Colors.gray[600] },
  name: { fontSize: 20, fontWeight: '700', color: Colors.gray[900] },
  route: { fontSize: 14, lineHeight: 20, color: Colors.gray[600] },
  hint: { fontSize: 14, lineHeight: 20, color: Colors.gray[700] },
  choices: { gap: 8 },
  choice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 12 },
  choiceSelected: { borderColor: Colors.primary, backgroundColor: '#FFF7F2' },
  choiceText: { flex: 1, fontSize: 16, color: Colors.gray[900] },
  ratingTitle: { fontSize: 20, fontWeight: '700', color: Colors.gray[900], textAlign: 'center' },
  ratingHint: { fontSize: 14, lineHeight: 20, color: Colors.gray[700], textAlign: 'center', marginTop: 8 },
  stars: { width: '100%', maxWidth: 320, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  star: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 16, fontWeight: '600', color: Colors.gray[800], textAlign: 'center', marginTop: 8, marginBottom: 24 },
  detailsToggle: { minHeight: 48, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailsLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.gray[800] },
  footer: { backgroundColor: Colors.white, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.gray[200] },
  footerButton: { marginBottom: 0, paddingVertical: 14, minHeight: 52 },
});
