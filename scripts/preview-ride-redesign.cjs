/* global __dirname */
// Real React components, synthetic fixtures, RN-Web layout only (no native map or API).
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

function fixture({ kind, width, height, textScale = 1 }) {
  const native = { ...web, useWindowDimensions: () => ({ width, height, fontScale: textScale, scale: 1 }),
    StyleSheet: { ...web.StyleSheet, create: values => web.StyleSheet.create(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
      ...value, ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}), ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
    }]))), },
  };
  const icon = ({ name, size, color }) => h('span', { style: { color, fontSize: size, width: size, flexShrink: 0, textAlign: 'center' }, 'aria-hidden': true },
    ({ 'arrow-back': '←', 'share-outline': '↗', 'checkmark': '✓', 'call-outline': '♧', 'chatbubble-outline': '▢',
      'search-outline': '⌕', 'create-outline': '✎', 'add': '+', 'remove': '−', 'close': '×', 'time-outline': '◷', 'navigate-outline': '➤', 'home-outline': '⌂' })[name] || '◇');
  const map = ({ overviewHeight = 320, style }) => h(web.View, { style: [{ height: overviewHeight, backgroundColor: '#D7EDE1', overflow: 'hidden' }, style], testID: 'synthetic-map' },
    h('svg', { viewBox: '0 0 390 330', preserveAspectRatio: 'none', style: { width: '100%', height: '100%' } },
      h('path', { d: 'M0 0H390V60L260 85L100 65L0 90Z', fill: '#BDE2ED' }),
      h('path', { d: 'M90 65L180 330 M300 90L330 330 M0 220L390 170 M0 140L390 280', stroke: 'white', strokeWidth: 7 }),
      h('path', { d: 'M250 115C240 175 180 180 177 255', fill: 'none', stroke: '#FF6935', strokeWidth: 5 }),
      h('circle', { cx: 250, cy: 115, r: 8, fill: '#199652', stroke: 'white', strokeWidth: 3 }),
      h('circle', { cx: 177, cy: 255, r: 8, fill: '#D54100', stroke: 'white', strokeWidth: 3 })));
  const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: icon },
    'expo-router': { useRouter: () => ({ push: noop }) },
    '@react-navigation/native': { useIsFocused: () => true },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ data: [] }) },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: () => ({ data: { availableBalance: 0, currency: 'CDF' } }) },
    '@/store/api/driverFinanceApi': { useTripPaymentOptionsQuery: () => ({ currentData: { availablePaymentModes: ['cash'] } }) },
    './tripDetailModel': { TRIP_PAYMENT_MODE_OPTIONS: [{ id: 'cash', label: 'Cash', icon: 'cash-outline' }], getTripPaymentModeLabel: () => 'Cash' },
    '@/components/forms/FormLayout': { FormModal: ({ visible, children }) => visible ? h(web.View, { style: { ...web.StyleSheet.absoluteFillObject, zIndex: 20 } }, children) : null },
    '@/components/PassengerSeatNotice': { PassengerSeatNotice: () => null },
    '@/components/LocationPickerModal': { __esModule: true, default: () => null },
    '@/components/location/LocationAccessBanner': { LocationAccessBanner: () => null },
    './HomeEntryStatus': { HomeEntryStatus: () => null },
    './HomeDriverStatus': { HomeDriverStatus: () => h(web.View, { style: { backgroundColor: 'white', borderRadius: 24, padding: 12 } }, h(web.Text, null, '● En ligne'), h(web.Text, { style: { fontSize: 11, color: '#5E697B' } }, 'Actualisé il y a 2 min')) },
    './SwipeableHomePriority': { SwipeableHomePriority: ({ children }) => children },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: item => load('utils/routeLocationLabels.ts').getRouteLocationLabels(item) },
    './CollapsibleRouteMap': { CollapsibleRouteMap: map },
    './RequestPickupSummaryCard': { RequestPickupSummaryCard: () => h(web.Text, { style: { color: '#5E697B', fontSize: 13 } }, 'Temps d’approche indisponible') },
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: () => null },
    './WithdrawRequestDriverButton': { WithdrawRequestDriverButton: () => h(web.Pressable, { accessibilityRole: 'button', style: { minHeight: 44, alignItems: 'center', justifyContent: 'center' } }, h(web.Text, { style: { color: '#B42318' } }, 'Annuler ma prise en charge')) },
    '@/features/request-detail/ChangeRequestDriverButton': { PickupDriverChange: () => null },
    '@/services/trackingSocket': { trackingSocket: {} },
    '@/utils/reanimated': { __esModule: true, default: { View: web.View }, FadeInDown: { delay: () => undefined } },
  });
  const trip = { id: 'synthetic-trip', driverId: 'synthetic-driver', driverName: 'Conducteur exemple', driverRating: 4, price: 0,
    status: 'upcoming', departureTime: '2030-11-25T11:00:00', arrivalTime: '2030-11-25T11:35:00', estimatedDurationSeconds: 2100,
    departure: { name: 'Rond-point Ngaba', address: 'Rond-point Ngaba' }, arrival: { name: 'Grand Marché de Kinshasa', address: 'Grand Marché de Kinshasa', reference: 'Entrée principale' },
    availableSeats: 4, totalSeats: 4, vehicleType: 'car', vehicle: { brand: 'Toyota', model: 'Corolla', color: 'Gris', licensePlate: 'TEST' },
  };
  const booked = kind === 'reservation';
  if (booked) trip.price = 4200;
  const booking = booked ? { id: 'synthetic-booking', tripId: trip.id, numberOfSeats: 1, status: 'accepted', totalPrice: 4200 } : null;
  const router = { push: noop };
  const summary = { trip, config: { label: 'À venir', color: '#987000', bgColor: '#FFF4CF' }, routeLabels: load('utils/routeLocationLabels.ts').getRouteLocationLabels(trip),
    tripPriceLabel: trip.price ? '4 200 FC' : 'Gratuit', tripDepartureTimeLabel: '25/11/2030 11:00', tripArrivalTimeLabel: '25/11/2030 11:35',
    tripSeatsLabel: '4 places', tripRouteDistanceLabel: '11,7 km', tripVehicleLabel: 'Toyota Corolla', tripVehicleMetaLabel: 'Gris · TEST',
    tripVehicleIconName: 'car', progress: 0, driverReviewAverage: 4, router, setVehicleDetailModalVisible: noop, handleContactDriver: noop, setContactModalVisible: noop, booking };
  const footerProps = { data: { trip, insets: { bottom: 0 }, router }, access: { availableSeats: 4, activeBookingStatus: booked ? { label: 'Acceptée', color: '#116E3A', background: '#E4F4EA' } : null },
    activity: { activeBooking: booking }, editor: {}, pricing: {}, payment: {}, bookingState: {}, bookingSubmission: {}, bookingLocation: { openBookingModal: noop } };
  let content;
  if (kind.startsWith('home')) {
    const driver = kind === 'home-driver';
    content = h(web.View, { style: { flex: 1 } }, h(map, { style: { position: 'absolute', width: '100%', height: '100%' } }),
      h(load('components/home/HomeHeader.tsx').HomeHeader, { router, insets: { top: 0 }, profileInitial: 'E', unreadNotifications: 12, isDriver: driver, discoveryLabel: '1 départ à découvrir', onDiscover: noop }),
      h(load('components/home/HomeTripsSheet.tsx').HomeTripsSheet, { isDriver: driver, router, isScreenActive: true, driverCategory: 'private',
        availableDriverRequests: [], latestTrips: driver ? [] : [trip], bookedTripIds: new Set(), hiddenHomePriorities: {}, recentDestinations: [],
        sheetHeight: (height - 64) * (textScale > 1.3 ? 0.66 : driver ? 0.54 : 0.58), sheetBottomOffset: 64, effectiveTripsSheetOpen: true, sheetTitle: 'Trajets',
        toggleTripsSheet: noop, openSheetIndex: noop, openTripDetail: noop, openTripRequestDetail: noop, suggestionScopeLabel: driver ? '' : 'Moins de 10 km · sous 48 h' }),
      h(web.View, { style: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 64, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' } },
        ['Accueil', 'Services', driver ? 'Mes trajets' : 'Trajets', 'Messages', 'Profil'].map(label => h(web.Text, { key: label, style: { fontSize: 10, color: '#1E294A' } }, label))));
  } else if (kind === 'booking') {
    const props = { bookingModalVisible: true, insets: { bottom: 0 }, viewportHeight: height, trip, bookingSeats: '1', bookingStep: 1,
      seatLimit: 4, estimatedTotal: 0, bookingPaymentMode: 'cash', passengerOriginDisplay: trip.departure.name, passengerDestinationDisplay: trip.arrival.name,
      bookingProposedPrice: '', passengerOriginManualAddress: '', passengerDestinationManualAddress: '', closeBookingModal: noop, handleConfirmBooking: noop };
    content = h(web.View, { style: { flex: 1 } }, h(map, { overviewHeight: height }), h(load('features/trip-detail/TripBookingModal.tsx').TripBookingModal, props));
  } else if (kind === 'course') {
    const request = { ...trip, id: 'synthetic-request', passengerId: 'synthetic-passenger', selectedDriverId: 'synthetic-driver', passengerName: 'Passager exemple',
      status: 'driver_selected', numberOfSeats: 1, departureDateMin: trip.departureTime, tripId: trip.id };
    const model = { tripRequest: request, assignedTrip: trip, isScreenActive: true, userId: trip.driverId, goHome: noop, handleViewTrip: noop, handleGoPickup: noop };
    content = h(web.View, { style: { flex: 1 } }, h(web.ScrollView, { style: { flex: 1 } }, h(load('features/request-detail/RequestDriverCourse.tsx').RequestDriverCourse,
      { model, presentation: { ownerDisplayedBudget: 4200, requestRouteMapData: {}, displayedRouteCoordinates: [] } })),
      h(load('features/request-detail/RequestDriverCourse.tsx').RequestCourseActions, { model }));
  } else {
    content = h(web.View, { style: { flex: 1 } }, h(web.ScrollView, { style: { flex: 1 }, contentContainerStyle: { paddingBottom: booked ? 160 : 90 } },
      h(map, { overviewHeight: Math.min(360, Math.max(230, height * 0.40)) }),
      h(web.View, { style: { backgroundColor: booked ? 'white' : '#FFFBF7', marginTop: -24, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 16 } },
        h(load('features/trip-detail/PassengerTripSummary.tsx').PassengerTripSummary, summary))),
      h(load('features/trip-detail/TripDetailActionsFooter.tsx').TripDetailActionsFooter, footerProps));
  }
  const markup = renderToStaticMarkup(content);
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif}#root{height:100%;display:flex;flex-direction:column;background:white}</style><main id="root">${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/ride-redesign-preview'); fs.mkdirSync(directory, { recursive: true });
  const session = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try { for (const kind of ['home-driver', 'home-passenger', 'course', 'booking', 'detail', 'reservation']) {
    for (const viewport of [{ width: 390, height: 844, textScale: 1 }, { width: 320, height: 568, textScale: 1.6 }]) {
      const name = `${kind}-${viewport.width}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture({ kind, ...viewport }));
      const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => session.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      let ready = false;
      for (let attempt = 0; attempt < 40 && !ready; attempt++) {
        ready = (await send('Runtime.evaluate', { expression: "document.readyState === 'complete' && !!document.getElementById('root')?.children.length", returnByValue: true })).result?.value;
        if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
      }
      const geometry = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const buttons = [...document.querySelectorAll('[role="button"]')];
        const inside = el => { const r=el.getBoundingClientRect();
          if(!(r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1)) return false;
          for(let p=el.parentElement;p;p=p.parentElement) { const s=getComputedStyle(p), b=p.getBoundingClientRect();
            if(/hidden|auto|scroll/.test(s.overflowY) && (b.height<1 || r.top<b.top-1 || r.bottom>b.bottom+1)) return false;
          } return true; };
        const clipped = buttons.filter(button => { button.scrollIntoView({block:'nearest'}); return !inside(button); }).map(button => button.getAttribute('aria-label') || button.textContent);
        const reachable = clipped.length === 0;
        const overflow = document.documentElement.scrollWidth > innerWidth;
        document.querySelectorAll('*').forEach(el => { if(el.scrollTop) el.scrollTop=0; });
        return {buttons:buttons.length, reachable, overflow, clipped}; })()` })).result.value;
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
      console.log(name, JSON.stringify(geometry));
      if (geometry.overflow || !geometry.reachable) process.exitCode = 1;
      await session.send('Target.closeTarget', { targetId });
    }
  } } finally { await session.close(); }
  console.log(directory);
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { fixture };
