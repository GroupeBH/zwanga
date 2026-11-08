import { StyleSheet } from 'react-native';
import { HOME_DASHBOARD_COLORS as c } from './homeDashboardTheme';

export const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, zIndex: 11,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    backgroundColor: '#FFFFFF', overflow: 'hidden',
  },
  scroll: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1 },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 12, backgroundColor: c.blue,
  },
  statusIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFFFF1F',
    alignItems: 'center', justifyContent: 'center',
  },
  statusCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  title: { color: '#FFFFFF', fontSize: 22, lineHeight: 26, fontWeight: '700' },
  role: { color: '#DDE6F5', fontSize: 13, lineHeight: 18 },
  itinerary: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6 },
  routeRow: { flexDirection: 'row', gap: 10 },
  routeTrack: { width: 24, alignItems: 'center' },
  departureMarker: { width: 12, height: 12, marginTop: 4, borderRadius: 6, borderWidth: 3, borderColor: c.green },
  routeLine: { flex: 1, width: 2, minHeight: 12, marginTop: 4, marginBottom: 4, backgroundColor: c.line },
  placeCopy: { flex: 1, minWidth: 0 },
  departureCopy: { paddingBottom: 8 },
  placeLabel: { color: c.muted, fontSize: 12, lineHeight: 16 },
  placeName: { color: c.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  footer: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  action: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: c.orange,
  },
  actionText: { color: '#FFFFFF', fontSize: 17, lineHeight: 23, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  horizontalSheet: { flexDirection: 'row' },
  horizontalContent: { flexDirection: 'row' },
  horizontalStatus: { width: 190, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 6 },
  horizontalStatusCopy: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
  horizontalItinerary: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  horizontalFooter: { width: 190, paddingHorizontal: 12, justifyContent: 'center' },
});
