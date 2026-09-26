import { Colors } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const compactWalletStyles = StyleSheet.create({
  overview: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, borderRadius: 20, backgroundColor: Colors.white },
  balanceHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  caption: { fontSize: 13, lineHeight: 19, color: Colors.gray[600], flexShrink: 1 },
  detailsToggle: { minHeight: 44, paddingHorizontal: 6, flexDirection: 'row', gap: 4, alignItems: 'center' },
  detailsLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray[600] },
  balance: { fontSize: 32, fontWeight: '800', color: Colors.gray[900], marginBottom: 6 },
  loader: { alignSelf: 'flex-start', marginVertical: 10 },
  breakdown: { gap: 8, paddingVertical: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  balanceLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  lineValue: { fontSize: 13, fontWeight: '600', color: Colors.gray[900] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  action: { flexGrow: 1, flexBasis: 76, minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1E9' },
  primaryIcon: { backgroundColor: Colors.primary },
  actionLabel: { color: Colors.gray[900], fontSize: 13, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  link: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.gray[200] },
  linkLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.gray[800] },
  withdrawalSection: { gap: 8 },
  withdrawalToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  withdrawalLabel: { flex: 1, color: Colors.gray[800], fontSize: 13, fontWeight: '600' },
  notice: { color: Colors.gray[700], fontSize: 13, lineHeight: 19 },
});
