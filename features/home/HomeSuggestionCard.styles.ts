import { StyleSheet } from 'react-native';
import { HOME_DASHBOARD_COLORS as c } from './homeDashboardTheme';

export const styles = StyleSheet.create({
  card: { width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: '#FFFFFF' },
  cardTop: { minHeight: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { flex: 1, color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  pricePill: { maxWidth: '48%', minHeight: 25, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: c.price },
  priceText: { color: '#893710', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  freePricePill: { backgroundColor: c.paleGreen },
  freePriceText: { color: c.greenInk },
  route: { marginTop: 10, marginBottom: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  arrivalRow: { marginTop: 7 },
  routeLine: { position: 'absolute', left: 4, top: 13, bottom: 13, width: 1.5, backgroundColor: '#D8D5D2' },
  departureDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.green },
  arrivalDot: { width: 9, height: 9, borderRadius: 2, backgroundColor: c.rust },
  place: { flex: 1, color: c.ink, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatarFallback: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#E8E6E4' },
  avatarInitial: { color: '#4D4843', fontSize: 15, fontWeight: '600' },
  personCopy: { flex: 1, minWidth: 0 },
  personName: { color: c.ink, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  personDetail: { marginTop: 1, color: '#4D4843', fontSize: 13, lineHeight: 17 },
  actionPill: { minHeight: 44, minWidth: 88, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tripAction: { backgroundColor: c.orange },
  requestAction: { backgroundColor: c.orange },
  actionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
