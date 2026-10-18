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
  'share-social-outline': '↗', 'time-outline': '◷', 'volume-high': '♪', 'stop-circle': '■', 'stop-circle-outline': '⊙',
  'ellipsis-horizontal': '···', refresh: '↻', 'navigate-outline': '➤', locate: '⊙' };
let viewport, account;
const state = () => ({ auth: { user: { id: account } }, zwangaApi: { config: { online: true } },
  rideRecovery: { userId: account, entries: [] } });
const load = loader({
  '@/assets/images/map-markers/trip-detail-marker-departure.png': 1,
  '@/assets/images/map-markers/trip-detail-marker-passenger.png': 2,
  '@/assets/images/map-markers/trip-detail-marker-arrival.png': 3,
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
const cases = [390, 320].flatMap(width => [
  ...['pickup', 'dropoff', 'pending', 'empty', 'offline'].map(mode => ({ width, actor: 'driver', mode })),
  { width, actor: 'passenger', mode: 'default' },
]);
for (const { width, actor, mode } of cases) {
  account = actor; viewport = { width, height: width === 320 ? 568 : 760 };
  const insets = { top: 24, bottom: 24, left: 0, right: 0 };
  const booking = { id: 'preview-booking', tripId: 'preview-trip', passengerId: 'passenger', status: 'accepted',
    passengerName: 'Passager exemple', numberOfSeats: 2, pickedUp: actor === 'passenger' || mode === 'dropoff',
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
  if (mode === 'dropoff') {
    foundation.mapState.waypoints[0].type = 'dropoff';
    foundation.mapState.waypoints[0].address = booking.passengerDestination;
  }
  if (mode === 'pending') Object.assign(foundation.passengers, {
    activePendingBooking: { ...booking, id: 'pending', passengerName: 'Nouveau passager', status: 'pending', paymentMode: 'cash' },
    activePendingBookingPickupLabel: 'Départ du nouveau passager', activePendingBookingDropoffLabel: 'Arrivée du nouveau passager', pendingBookingQueueCount: 1,
  });
  if (mode === 'empty') { foundation.mapState.waypoints = []; data.bookings = []; }
  if (mode === 'offline') { foundation.mapState.isSocketConnected = false; data.offlineTrip = true; }
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
  previews.push(renderToStaticMarkup(h('section', { 'data-case': `${actor}-${mode}-${width}` },
    h('h2', null, `${actor === 'driver' ? 'Conducteur' : 'Passager'} · ${mode} · ${width} px`),
    h(native.View, { style: { width, height: viewport.height, backgroundColor: '#E8EEE8', overflow: 'hidden' } },
      h('div', { className: 'map-placeholder' }, 'Carte · aperçu sans GPS'), content))));
}
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Navigation — aperçu statique</title>
<style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#f4f5f6;font-family:Arial,sans-serif}
main{display:flex;flex-wrap:wrap;gap:18px;padding:18px;align-items:flex-start}h2{font-size:14px;font-weight:500}
.map-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#67756c;
background:repeating-linear-gradient(35deg,transparent 0 70px,#fff 71px 78px,transparent 79px 150px)}</style>
<main>${previews.join('')}</main><script>
const requested = new URLSearchParams(location.search).get('case');
if (requested) document.querySelectorAll('[data-case]').forEach(el => { if (!el.dataset.case.includes(requested)) el.remove(); });
</script></html>`;
const target = path.join(directory, 'index.html');
fs.writeFileSync(target, html);
console.log(target);
