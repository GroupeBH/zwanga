/* global __dirname */
// Actual detail screen + synthetic driver state. Map renderer is SVG, NOT a native map/route API test.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function renderFixture({ width, height, textScale = 1, status = 'upcoming', pending = false, reservation = false }) {
  const departure = { latitude: -4.32, longitude: 15.29 }, arrival = { latitude: -4.4, longitude: 15.35 };
  const coordinates = [departure, { latitude: -4.34, longitude: 15.295 }, { latitude: -4.36, longitude: 15.33 }, arrival];
  const trip = { id: 'synthetic-published-trip', driverId: 'synthetic-driver', status, price: 2500, departureTime: '2030-01-01T09:30:00Z',
    departure: { name: 'Avenue des Aviateurs', address: 'Gombe, Kinshasa' }, arrival: { name: 'Kintambo Magasin', address: 'Kintambo, Kinshasa' },
    acceptedPaymentModes: ['electronic', 'points'] };
  const native = { ...web, StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
    Object.entries(styles).map(([key, value]) => [key, { ...value,
      ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
      ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
    }]))),
  } };
  const hidden = Object.fromEntries(['TripImageModal', 'TripContactModal', 'TripReviewsModal', 'TripEditModal',
    'TripBookingSuccessModal', 'TripMapModal', 'TripBookingModal', 'TripSosModal', 'TripVehicleDetailsModal']
    .map(name => [`../../features/trip-detail/${name}`, { [name]: () => null }]));
  const model = {
    data: { trip, tripId: trip.id, user: { id: trip.driverId }, isTripDriver: true, viewportHeight: height, isScreenActive: true,
      tripBookings: pending ? [{ id: 'synthetic-booking', status: 'pending', passengerId: 'synthetic-passenger', passengerName: 'Passager de test',
        numberOfSeats: 2, tripId: trip.id, totalPrice: 5000, proposedPricePerSeat: 1800 }] : [],
      insets: { top: 0, bottom: 0 }, router: { push: noop }, goHome: noop },
    bookingState: { isDetailMapReady: true }, activity: {}, contact: {}, safety: {}, access: {}, pricing: {}, payment: {},
    bookingSubmission: {}, bookingLocation: {}, wizard: {},
    editing: { editor: {}, edit: {}, editLabels: {}, editRoute: {}, editSchedule: {}, editSubmission: {} },
    config: { label: status === 'ongoing' ? 'En cours' : status === 'completed' ? 'Terminé' : 'À venir', color: '#18835D', bgColor: '#ECF8F1' },
    hasRenderableTripMap: status !== 'ongoing', canRenderTripMap: status !== 'ongoing',
    route: { departureCoordinate: departure, arrivalCoordinate: arrival },
    mapPresentation: { mapRegion: { latitude: -4.36, longitude: 15.32, latitudeDelta: 0.12, longitudeDelta: 0.1 },
      routeMapCoordinates: coordinates, hasDetailedRouteMapCoordinates: true, passengerDestinationMarkers: [] },
  };
  function Map({ style, region, children }) {
    const nodes = React.Children.toArray(children), line = nodes.find(node => node.type === 'Polyline');
    const project = point => [50 + (point.longitude - region.longitude) / region.longitudeDelta * 100,
      50 - (point.latitude - region.latitude) / region.latitudeDelta * 100];
    return h(web.View, { style, testID: 'synthetic-route-map' }, h('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none',
      style: { width: '100%', height: '100%', background: '#EDF2EB' }, 'aria-label': 'Carte simulée pour contrôle de mise en page' },
    [20, 40, 60, 80].map(n => h('path', { key: n, d: `M0 ${n}H100 M${n} 0V100`, stroke: 'white', strokeWidth: 2 })),
    h('polyline', { points: line?.props.coordinates.map(point => project(point).join(',')).join(' '),
      fill: 'none', stroke: '#FF692B', strokeWidth: 1.4 }),
    [departure, arrival].map((point, i) => h('circle', { key: i, cx: project(point)[0], cy: project(point)[1], r: 2.2,
      fill: i ? '#FF692B' : '#2CC86E', stroke: 'white', strokeWidth: 1 }))));
  }
  const load = loader({ ...hidden, 'react-native': native,
    '../../hooks/trip-detail/useTripDetailController': { useTripDetailController: () => model },
    '@/hooks/trip-detail/useDriverTripWorkspace': { useDriverTripWorkspace: () => ({
      ready: true, busy: false, state: { trip, userId: trip.driverId, bookings: model.data.tripBookings, isOwner: true, isScreenActive: true,
        router: model.data.router }, actions: {}, bookingsActions: {},
    }) },
    '@/features/manage-trip/ManageTripContactModal': { ManageTripContactModal: () => null },
    '@/components/trip/NextRequestAfterTrip': { NextRequestAfterTrip: () => null },
    '@/features/request-detail/WithdrawRequestDriverButton': { TripDriverWithdrawal: () => null },
    '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: () => null },
    '@/store/api/tripApi': { useCancelDriverTripInterruptionMutation: () => [noop, { isLoading: false }] },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: noop }) },
    '@/components/trip/CompactCardAvatar': { CompactCardAvatar: () => h(web.Text, null, 'P') },
    './tripDetailModel': { USE_CUSTOM_MAP_MARKERS: false, USE_ANDROID_MAP_MARKER_IMAGES: false },
    '@/services/trackingSocket': { trackingSocket: {} },
    '@/components/LocationPickerModal': { __esModule: true, default: () => null },
    '@/components/TutorialOverlay': { TutorialOverlay: () => null },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: ({ children }) => children, useRideOverlayStore: () => reservation ? {} : null },
    '@/features/navigation/RideModal': { RideModal: ({ visible, children }) => visible
      ? h(web.View, { style: { ...web.StyleSheet.absoluteFillObject, zIndex: 10 } }, children) : null },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    'react-native-safe-area-context': { SafeAreaView: web.View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/utils/reanimated': { __esModule: true, default: { View: web.View }, FadeInDown: { delay: () => undefined } },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
      style: { fontSize: size, color, width: size, textAlign: 'center', flexShrink: 0 } },
    ({ 'arrow-back': '←', 'share-outline': '↗', 'people-outline': '♙', 'expand': '⛶', 'create-outline': '✎',
      'close-circle-outline': '⊗', 'play': '▶', 'pause-circle-outline': 'Ⅱ', 'chevron-down': '⌄' })[name] ?? '◇') },
    'react-native-maps': { __esModule: true, default: Map, Marker: 'Marker', Polyline: 'Polyline' },
  });
  model.presentation = { routeLabels: load('utils/routeLocationLabels.ts').getRouteLocationLabels(trip), tripPriceLabel: '2 500 FC',
    tripDepartureTimeLabel: '10 nov. · 09:30', tripArrivalTimeLabel: '10 nov. · 09:55', tripSeatsLabel: '3 places',
    tripRouteDistanceLabel: '8 km', tripVehicleIconName: 'car', tripVehicleLabel: 'Voiture de test', tripVehicleMetaLabel: 'Voiture · Gris' };
  const html = renderToStaticMarkup(h(load('app/trip/[id].tsx').default));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent} html,body{height:100%;margin:0;font-family:Arial,sans-serif}
    #root{display:flex;flex-direction:column;position:relative;width:${width}px;height:calc(100% - 48px);padding-top:24px;margin:auto}</style>
    <main id="root">${html}</main></html>`;
}

async function run() {
  const browser = process.argv[2]; if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium path.');
  const directory = path.resolve(__dirname, '../.expo/published-trip-preview'); fs.mkdirSync(directory, { recursive: true });
  const session = await chromium(browser, fs.mkdtempSync(path.join(directory, 'session-'))), reports = [];
  try { for (const scenario of [{ width: 390, height: 844, name: 'owner-390' }, { width: 360, height: 800, name: 'owner-360' },
    { width: 320, height: 568, name: 'owner-small' }, { width: 320, height: 568, textScale: 1.35, name: 'owner-large-text' },
    { width: 390, height: 844, name: 'owner-pending', pending: true },
    { width: 390, height: 844, name: 'reservation', pending: true, reservation: true },
    { width: 320, height: 568, name: 'reservation-small', pending: true, reservation: true },
    { width: 320, height: 568, textScale: 1.35, name: 'reservation-large-text', pending: true, reservation: true },
    { width: 320, height: 568, name: 'owner-ongoing', status: 'ongoing' },
    { width: 320, height: 568, name: 'owner-completed', status: 'completed' }]) {
    const file = path.join(directory, `${scenario.name}.html`); fs.writeFileSync(file, renderFixture(scenario));
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const button = document.querySelector('[data-testid="driver-trip-actions"]');
        const map = document.querySelector('[data-testid="synthetic-route-map"]');
        if(!button) return null;
        const r=button.getBoundingClientRect(), m=map?.getBoundingClientRect();
        const icons=['Modifier le trajet','Annuler le trajet','Partager le trajet'].map(label=>document.querySelector('[aria-label="'+label+'"]')).filter(Boolean);
        const boxes=icons.map(node=>node.getBoundingClientRect());
        const panel=document.querySelector('[data-testid="driver-reservation-modal"]');
        const p=panel?.getBoundingClientRect();
        const decisions=panel?Array.from(panel.querySelectorAll('[role="button"]')).map(node=>node.getBoundingClientRect()):[];
        return {footerVisible:r.top>=24&&r.bottom<=innerHeight-24,mapVisible:!m||(m.top>=24&&m.bottom<=r.top),
          reservationUsable:!p||(p.top>=24&&p.bottom<=innerHeight-24&&decisions.length===3&&decisions.every(b=>b.height>=44&&b.top>=24&&b.bottom<=innerHeight-24&&b.left>=0&&b.right<=innerWidth)),
          headerActionsUsable:boxes.every(b=>b.width>=44&&b.height>=44&&b.left>=0&&b.right<=innerWidth)&&boxes.every((b,i)=>i===0||b.left>=boxes[i-1].right),
          horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report) throw Error(`Missing layout ${scenario.name}`);
    console.log(scenario.name, JSON.stringify(report)); reports.push({ ...scenario, ...report });
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
    if (!report.footerVisible || !report.mapVisible || !report.headerActionsUsable || !report.reservationUsable || report.horizontalOverflow > 1) throw Error(`Clipped ${scenario.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
}
if (require.main === module) void run().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { renderFixture };
