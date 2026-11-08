/* global __dirname */
// Real Home components via RN Web with synthetic rides. No API, GPS or native map.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement, noop = () => {};
const icons = { 'car-sport-outline': '▱', 'navigate-outline': '➤', navigate: '➤', 'notifications-outline': '♧', 'location-sharp': '♦' };
const load = loader({
  'react-native': native,
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span',
    { style: { color, fontSize: size } }, icons[name] ?? '•') },
  './HomeDriverStatus': { HomeDriverStatus: () => null },
});
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { HomeOngoingTripSheet } = load('components/home/HomeOngoingTripSheet.tsx');
const { HOME_DASHBOARD_COLORS: c } = load('features/home/homeDashboardTheme.ts');
const cases = [
  { width: 390, height: 744, role: 'driver' },
  { width: 320, height: 568, role: 'passenger' },
  { width: 680, height: 320, role: 'passenger' },
];
const previews = cases.map(({ width, height, role }) => {
  const trip = { id: 'preview-trip', status: 'ongoing', departure: { name: 'Rond-point Ngaba' }, arrival: { name: 'Gare Centrale, Gombe' } };
  const booking = { id: 'preview-booking', tripId: trip.id, passengerOrigin: 'Avenue des Aviateurs', passengerDestination: 'Université Pédagogique Nationale (UPN)' };
  const sceneHeight = height - 68;
  const sheetHeight = Math.min(288, sceneHeight * 0.55);
  return h(native.View, { key: `${role}-${width}`, style: { width } },
    h(native.Text, { style: { paddingBottom: 12 } }, `${role} · ${width} × ${height}`),
    h(native.View, { style: { height, backgroundColor: '#E8EEE8', overflow: 'hidden' } },
      h(native.View, { style: { height: sceneHeight } },
        h(native.Text, { style: { position: 'absolute', top: 102, alignSelf: 'center', color: '#57635C' } }, 'Carte · aperçu sans GPS'),
        h(HomeHeader, { insets: { top: 0 }, profileInitial: 'T', unreadNotifications: 2,
          ongoingDriverTrip: role === 'driver' ? trip : null, ongoingBookedTrip: role === 'passenger' ? trip : null,
          ongoingBookingId: booking.id, showOngoingShortcut: false, router: { push: noop } }),
        h(HomeOngoingTripSheet, { activeHomeTrip: trip, ongoingDriverTrip: role === 'driver' ? trip : null,
          ongoingBookingId: role === 'passenger' ? booking.id : null, activeBookings: [booking],
          width, sheetHeight, sheetBottomOffset: 0, onSheetLayout: noop, router: { push: noop } }),
      ),
      h(native.View, { style: { height: 68, backgroundColor: '#FFFFFF', flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-around', borderTopWidth: 1, borderColor: c.line } },
      ...['Accueil', 'Mes trajets', 'Messages', 'Profil'].map(label => h(native.Text,
        { key: label, style: { fontSize: 12, color: label === 'Accueil' ? c.orange : c.muted } }, label))),
    ));
});
const markup = renderToStaticMarkup(h(native.View, { style: { padding: 18, flexDirection: 'row', gap: 18 } }, previews));
const directory = path.resolve(__dirname, '../.expo/home-ongoing-preview');
fs.mkdirSync(directory, { recursive: true });
const target = path.join(directory, 'index.html');
fs.writeFileSync(target, `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Accueil pendant un trajet</title>
<style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#F3F4F6;font-family:Arial,sans-serif}</style>${markup}</html>`);
console.log(target);
