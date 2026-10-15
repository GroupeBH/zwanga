import { StyleSheet } from 'react-native';
import { homePalette as p } from './HomeDashboard.styles';
export const styles = StyleSheet.create({
  sheet: { flex: 1, minHeight: 0, marginTop: -24, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    backgroundColor: p.canvas, overflow: 'hidden' },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 12 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#D8D4CE' },
  list: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 20, width: '100%', maxWidth: 700, alignSelf: 'center' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  sheetTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: p.ink },
  modes: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  mode: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 14 },
  selectedMode: { backgroundColor: '#F4E7DD' },
  modeText: { color: p.muted, fontSize: 17, fontWeight: '600' },
  selectedModeText: { color: p.accent },
  seeAllButton: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  seeAllText: { color: p.accent, fontSize: 14, fontWeight: '600' },
  scopeLabel: { color: p.muted, fontSize: 12, marginBottom: 8 },
  state: { paddingVertical: 20, alignItems: 'center', gap: 8 },
  stateText: { color: p.muted, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 },
});
