import { StyleSheet } from 'react-native';

/** Presentation only: no dispatch, pricing or reservation state lives here. */
export const rideColors = {
  ink: '#1E294A', text: '#111827', muted: '#5E697B', orange: '#D54100',
  peach: '#FFF0E8', line: '#E3E6ED', warm: '#FFFBF7', white: '#FFFFFF',
  green: '#199652', greenInk: '#116E3A', greenSoft: '#E4F4EA', pale: '#F2F4F7',
};

export const rideStyles = StyleSheet.create({
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 18 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 3, backgroundColor: '#D1D5DD', marginTop: -8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  copy: { flex: 1, minWidth: 0 },
  muted: { color: rideColors.muted, fontSize: 14, lineHeight: 20 },
  name: { color: rideColors.text, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  time: { color: rideColors.text, fontSize: 38, lineHeight: 46, fontWeight: '800', fontVariant: ['tabular-nums'] },
  amount: { color: rideColors.text, fontSize: 25, lineHeight: 32, fontWeight: '800' },
  right: { textAlign: 'right' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFE5D6', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#A6380A', fontSize: 17, fontWeight: '700' },
  circle: { width: 46, height: 46, borderRadius: 23, backgroundColor: rideColors.pale, alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 24, backgroundColor: rideColors.greenSoft, flexDirection: 'row', gap: 6, alignItems: 'center', maxWidth: '100%' },
  pillText: { color: rideColors.greenInk, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  outline: { borderWidth: 1, borderColor: rideColors.line, borderRadius: 18, padding: 16, gap: 12 },
});

export function rideInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toLocaleUpperCase('fr-FR');
}

export function rideClock(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function rideDay(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'Date à confirmer';
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const prefix = date.toDateString() === today.toDateString() ? 'Aujourd’hui'
    : date.toDateString() === tomorrow.toDateString() ? 'Demain' : '';
  const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return prefix ? `${prefix} · ${label}` : label;
}

export function rideArrivalTime(departure?: string, arrival?: string | null) {
  const clock = rideClock(arrival);
  if (clock === '—') return clock;
  const date = new Date(arrival!);
  return departure && new Date(departure).toDateString() === date.toDateString() ? clock
    : `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${clock}`;
}
