import { StyleSheet } from 'react-native';

/** Static, presentation-only accents. No time, status or priority logic here. */
export const priorityAccents = {
  reservation: { color: '#176448', icon: 'ticket-outline' },
  upcoming: { color: '#31517E', icon: 'time-outline' },
  request: { color: '#A6421C', icon: 'paper-plane-outline' },
} as const;

export type HomePriorityAppearance = keyof typeof priorityAccents;
export type SearchCardAppearance = 'trip' | 'request';

export const prioritySurfaces = StyleSheet.create({
  reservation: { backgroundColor: '#F3FAF6', borderColor: '#C7E3D4' },
  upcoming: { backgroundColor: '#F4F7FC', borderColor: '#CEDBED' },
  request: { backgroundColor: '#FFF7F1', borderColor: '#F3D5C4' },
});

export const accentStyles = StyleSheet.create({
  priorityRail: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 3, borderRadius: 2 },
  priorityLabel: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  priorityIcon: { flexShrink: 0 },
  searchSurface: { backgroundColor: '#FFFFFF', borderColor: '#DCE2E8' },
  searchDate: { color: '#31517E' },
  searchPrice: { color: '#A6421C' },
  // Inline highlights deliberately add no padding, weight or line-height:
  // keep exactly the existing text flow and card geometry in search results.
  available: { color: '#176448', backgroundColor: '#EAF6EF' },
  requested: { color: '#A6421C', backgroundColor: '#FFF0E7' },
  unavailable: { color: '#495057', backgroundColor: '#F1F3F5' },
  offers: { color: '#31517E', backgroundColor: '#EAF0FA' },
});
