/* global __dirname */
// Actual RN components rendered statically through RN Web. Synthetic data only;
// no map SDK, server, geolocation, native animation or payment is exercised.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const noop = () => {};
const icons = { close: '×', 'arrow-back': '←', 'car-outline': '▱', 'flag-outline': '⚑',
  'people-outline': '♧', 'chevron-forward': '›', 'chevron-down': '⌄', 'call-outline': '☎',
  'share-social-outline': '↗', 'time-outline': '◷', 'volume-high': '♪', 'stop-circle': '■',
  'ellipsis-horizontal': '···', refresh: '↻', 'navigate-outline': '➤' };
let viewport, account;
const state = () => ({ auth: { user: { id: account } }, zwangaApi: { config: { online: true } },
  rideRecovery: { userId: account, entries: [] } });
const load = loader({
  'react-native': { ...native, useWindowDimensions: () => viewport },
  'react-native-safe-area-context': { SafeAreaView: ({ edges: _edges, ...props }) => h(native.View, props) },
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span',
    { style: { fontSize: size, color, lineHeight: 1 } }, icons[name] ?? '•') },
  '@/components/forms/FormLayout': { FormModal: () => null },
  '@/features/navigation/RideModal': { RideModal: () => null },
  '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
  '@/hooks/navigation/useRideActionFeedback': { useRideActionFeedback: () => ({ saved: noop, failed: noop }) },
  '@/store/hooks': { useAppSelector: selector => selector(state()) },
  '@/store/api/rideRecoveryApi': { useGetRideDeclarationsQuery: () => ({ refetch: noop }) },
  '@/services/rideOutbox': { rideOutbox: {} },
  '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: () => null },
  './DriverDropoffReceipts': { DriverDropoffReceipts: () => null },
  './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: () => null },
  './DriverPendingBookingPrompt': { DriverPendingBookingPrompt: () => null },
  './DriverInterruptionPrompt': { DriverInterruptionPrompt: () => null },
  '@/components/trip/PausedPassengerRideNotice': { PausedPassengerRideNotice: () => null },
  '@/utils/reanimated': { __esModule: true, default: { View: ({ entering: _entering, ...props }) => h(native.View, props) },
    FadeInUp: { duration: () => ({ delay: () => undefined }) } },
});
const { DriverNavigationTopPanel } = load('features/driver-navigation/DriverNavigationTopPanel.tsx');
const { DriverNavigationControls } = load('features/driver-navigation/DriverNavigationControls.tsx');
const { PassengerNavigationHeader } = load('features/passenger-navigation/PassengerNavigationHeader.tsx');
const { PassengerNavigationInfoCard } = load('features/passenger-navigation/PassengerNavigationInfoCard.tsx');
const { getDriverNavigationLayout } = load('features/driver-navigation/driverNavigationLayout.ts');
const assistance = { enabled: true, openContacts: noop, openContact: noop, openSos: noop };
const directory = path.resolve(__dirname, '../.expo/active-navigation-preview');
fs.mkdirSync(directory, { recursive: true });
const previews = [];
for (const width of [390, 320]) for (const actor of ['driver', 'passenger']) {
  account = actor; viewport = { width, height: width === 320 ? 568 : 760 };
  const insets = { top: 24, bottom: 24, left: 0, right: 0 };
  const booking = { id: 'preview-booking', tripId: 'preview-trip', passengerId: 'passenger', status: 'accepted',
    passengerName: 'Passager exemple', numberOfSeats: 2, pickedUp: actor === 'passenger',
    passengerOrigin: 'Rond-point Ngaba', passengerDestination: 'Grand Marché de Kinshasa' };
  const trip = { id: booking.tripId, status: 'ongoing', driverName: 'Conducteur exemple',
    departure: { address: booking.passengerOrigin }, arrival: { address: booking.passengerDestination } };
  const data = { tripId: trip.id, trip, booking, bookings: [booking, { ...booking, id: 'second', passengerName: 'Autre passager' }],
    insets, isScreenActive: true, isTripOngoing: true };
  const tripActions = { handleShareTrip: noop, handlePauseTripFromNavigation: noop, handleEditTripFromNavigation: noop };
  const passengerPresentation = { passengerStats: { totalPassengers: 3, inVehicle: 1, pendingPickups: 2 }, fitVehicleAndPassengers: noop };
  const foundation = { data, mapState: { currentWaypointIndex: 0, isSocketConnected: true, isVoiceGuidanceEnabled: true,
    waypoints: [{ type: 'pickup', completed: false, booking, passenger: { name: booking.passengerName }, address: booking.passengerOrigin }] },
    passengers: { passengerMapLocations: [] }, refs: { currentLocationRef: { current: null } } };
  const model = { session: { foundation }, presentation: { displayedDurationText: '8 min', displayedDistanceText: '2,4 km', displayedEtaText: '15:10' },
    passengerPresentation, tripActions, bookingActions: {}, handleExitNavigation: noop };
  const passenger = { data, state: { isSocketConnected: true, navigateBackSafely: noop },
    presentation: { tripStatus: 'in_transit', displayedRouteDistance: '2,4 km', displayedRouteDuration: '8 min' },
    tripActions, interruption: {}, pickupEstimate: null };
  const layout = getDriverNavigationLayout(viewport.height, insets.top, insets.bottom);
  const content = actor === 'driver' ? [h(DriverNavigationTopPanel, { key: 'top', model, assistance }),
    h(DriverNavigationControls, { key: 'controls', foundation, passengerPresentation, tripActions, voice: {}, forceRecalculateRoute: noop }),
    h(native.View, { key: 'guidance', style: { position: 'absolute', left: 12, right: 12, bottom: layout.guidanceBottom,
      padding: 18, borderRadius: 18, backgroundColor: '#26363D' } }, h(native.Text, { style: { color: 'white' } }, '↗ Dans 200 m, tournez à droite'))]
    : [h(PassengerNavigationHeader, { key: 'header', model: passenger, assistance }),
      h(native.View, { key: 'bottom', style: { position: 'absolute', bottom: 0, left: 0, right: 0 } }, h(PassengerNavigationInfoCard, passenger))];
  previews.push(renderToStaticMarkup(h('section', { 'data-case': `${actor}-${width}` },
    h('h2', null, `${actor === 'driver' ? 'Conducteur' : 'Passager'} · ${width} px`),
    h(native.View, { style: { width, height: viewport.height, backgroundColor: '#E8EEE8', overflow: 'hidden' } },
      h('div', { className: 'map-placeholder' }, 'Carte · aperçu sans GPS'), content))));
}
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Navigation — aperçu statique</title>
<style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#f4f5f6;font-family:Arial,sans-serif}
main{display:flex;flex-wrap:wrap;gap:18px;padding:18px;align-items:flex-start}h2{font-size:14px;font-weight:500}
.map-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#67756c;
background:repeating-linear-gradient(35deg,transparent 0 70px,#fff 71px 78px,transparent 79px 150px)}</style>
<main>${previews.join('')}</main></html>`;
const target = path.join(directory, 'index.html');
fs.writeFileSync(target, html);
console.log(target);
