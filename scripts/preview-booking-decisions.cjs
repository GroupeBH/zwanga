/* global __dirname */
// Static rendering of the actual passenger list, with synthetic data only.
// Does not exercise native notifications, maps, authentication or server mutations.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement, noop = () => {};
const load = loader({ 'react-native': native,
  '@expo/vector-icons': { Ionicons: ({ name, color, size }) => h('span', { style: { color, fontSize: size } },
    ({ 'call-outline': '☎', 'chevron-forward': '›', navigate: '➤' })[name] ?? '•') },
  '@/components/trip/CompactCardAvatar': { CompactCardAvatar: ({ name }) => h(native.View, {
    style: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F2F1ED', justifyContent: 'center', alignItems: 'center' },
  }, h(native.Text, null, name[0])) },
  '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: () => null },
});
const { ManageTripBookings } = load('features/manage-trip/ManageTripBookings.tsx');
const trip = { id: 'preview-trip', status: 'upcoming', price: 2500, departureTime: '2026-10-19T10:00:00Z',
  departure: { address: 'Rond-point Ngaba' }, arrival: { address: 'Grand Marché de Kinshasa' } };
const rows = [1, 2].map(index => ({ id: `preview-${index}`, tripId: trip.id, status: 'pending', passengerId: `person-${index}`,
  passengerName: `Passager exemple ${index}`, numberOfSeats: 1, passengerOrigin: trip.departure.address,
  passengerDestination: trip.arrival.address }));
const samples = [390, 320].map(width => h('section', { key: width }, h('h2', null, `${width} px · réservations en attente`),
  h(native.View, { style: { width, height: width === 320 ? 568 : 760, overflow: 'auto', backgroundColor: '#F8F9FA', padding: 12 } },
    h(native.Text, { style: { fontSize: 20, fontWeight: '700', marginBottom: 18 } }, 'Gestion du trajet'),
    h(ManageTripBookings, { tracking: { visibleBookings: rows }, state: { trip, focusBookingId: rows[1].id, router: {}, setContactBookingId: noop },
      actions: { handleOpenNavigation: noop }, bookingsActions: { handleAcceptBooking: noop, handleRejectBooking: noop } }))));
const content = renderToStaticMarkup(h('main', null, samples));
const directory = path.resolve(__dirname, '../.expo/booking-decisions-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8">
<title>Réservations — aperçu statique</title><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#e9ebed;font-family:Arial,sans-serif}main{display:flex;gap:20px;padding:20px;align-items:flex-start}h2{font-size:14px}
</style>${content}</html>`);
console.log(path.join(directory, 'index.html'));
