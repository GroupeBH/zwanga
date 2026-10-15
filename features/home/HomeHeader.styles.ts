import { StyleSheet } from 'react-native';
export const styles = StyleSheet.create({
  topOverlay: { position: 'absolute', left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between' },
  roundButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center', elevation: 3, shadowColor: '#202020',
    shadowOpacity: 0.12, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  initial: { color: '#BC4008', fontSize: 20, fontWeight: '700' },
  badge: { position: 'absolute', right: -3, top: -3, minWidth: 20, minHeight: 20, paddingHorizontal: 4,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#BC4008', borderWidth: 2, borderColor: '#FFFFFF' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
});
