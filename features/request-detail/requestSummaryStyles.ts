import { StyleSheet } from 'react-native';
import { ACTION_COLORS } from '@/constants/actionColors';

export const requestSummaryStyles = StyleSheet.create({
  passengerScreen: { backgroundColor: '#F2EEE9' }, driverScreen: { backgroundColor: '#EDF1F4' },
  header: { backgroundColor: 'transparent', borderBottomWidth: 0, paddingVertical: 10, gap: 12 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' },
  back: { backgroundColor: '#FFFFFF', width: 44, height: 44, borderRadius: 24 },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  decisionScroll: { flex: 1, minHeight: 0 }, decisionContent: { padding: 12, paddingBottom: 12, gap: 10 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, gap: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFF4C7' },
  badgeText: { color: '#8F3D08', fontSize: 12, fontWeight: '700' }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EE9B00' },
  muted: { fontSize: 14, lineHeight: 20, color: '#536071' }, label: { fontSize: 12, fontWeight: '700', color: '#536071' },
  name: { color: '#111827', fontSize: 16, fontWeight: '700' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  time: { fontSize: 34, fontWeight: '800', color: '#111827', fontVariant: ['tabular-nums'] },
  side: { flex: 1, gap: 5 }, right: { textAlign: 'right' },
  address: { fontSize: 16, lineHeight: 22, color: '#111827', fontWeight: '700' },
  dashed: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#DADFE6', marginVertical: 8 },
  amount: { fontSize: 24, fontWeight: '800', color: '#111827' },
  footer: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 }, footerWhite: { backgroundColor: '#FFFFFF' },
  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  primary: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ACTION_COLORS.orange, borderRadius: 30, paddingHorizontal: 20, paddingVertical: 16, minHeight: 54 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  cancel: { backgroundColor: '#FFFFFF', minHeight: 54, paddingHorizontal: 16, paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#BF1B20', fontSize: 14, fontWeight: '700' },
  secondary: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { fontSize: 14, color: '#536071' }, disabled: { opacity: 0.5 },
});
