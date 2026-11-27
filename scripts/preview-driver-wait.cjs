/* global __dirname */
// Actual components with synthetic data and RN-Web. No API, GPS, notifications or native maps.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(kind, width, height, fontScale) {
  const request = { id: 'test-order', passengerId: 'test-passenger', selectedDriverId: 'test-driver',
    tripId: 'test-trip', status: 'driver_selected', immediateDispatch: true,
    selectedAt: new Date(Date.now() - 20 * 60_000).toISOString() };
  const trip = { id: request.tripId, driverId: request.selectedDriverId, tripRequestId: request.id, status: 'ongoing',
    departure: { address: 'Départ de test' }, arrival: { address: 'Destination de test' }, price: 5000 };
  const booking = { id: 'test-booking', tripId: trip.id, passengerId: request.passengerId, status: 'accepted', numberOfSeats: 1 };
  const native = { ...web, useWindowDimensions: () => ({ width, height, fontScale, scale: 1 }),
    StyleSheet: { ...web.StyleSheet, create: values => web.StyleSheet.create(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
      ...value, ...(value.fontSize ? { fontSize: value.fontSize * fontScale } : {}), ...(value.lineHeight ? { lineHeight: value.lineHeight * fontScale } : {}),
    }]))), },
  };
  const load = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: () => h(web.Text, null, '↗') },
    'expo-router': { useRouter: () => ({ replace: noop }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: noop }) },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: request.passengerId } } }), useAppDispatch: () => noop },
    '@/store/api/requestDriverApi': { useChangeRequestDriverMutation: () => [() => { throw Error('No writes in preview'); }, { isLoading: false }] },
    '@/store/api/tripRequestApi': { useGetTripRequestByIdQuery: () => ({ currentData: request }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: enabled => enabled, displayReadOptions: () => ({}) },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: noop },
    '@/hooks/request-detail/useRequestResponseWindow': { useRequestResponseWindow: noop },
    './CollapsibleRouteMap': { CollapsibleRouteMap: () => null },
    './PassengerPriceOffers': { PassengerPriceOffers: () => null },
    './RequestTargetDriver': { RequestTargetDriver: () => null },
    './RequestPickupSummaryCard': { RequestPickupSummaryCard: () => null },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: () => null },
    '@/components/trip/PausedPassengerRideNotice': { PausedPassengerRideNotice: () => null },
    '@/utils/reanimated': { __esModule: true, default: { View: web.View }, FadeInUp: { duration: () => ({ delay: noop }) } },
  });
  const data = { trip, booking, isScreenActive: true, isOnline: true, isTripOngoing: true, insets: { bottom: 0 }, router: { push: noop } };
  let content;
  if (kind === 'request') content = h(load('features/request-detail/RequestPassengerTicket.tsx').RequestPassengerActions, {
    model: { tripRequest: request, assignedTrip: trip, passengerBooking: booking, isScreenActive: true, canCancel: true },
  });
  if (kind === 'trip') content = h(load('features/trip-detail/TripDetailActionsFooter.tsx').TripDetailActionsFooter, {
    data, activity: { activeBooking: booking }, access: { activeBookingStatus: { label: 'Acceptée' } },
    editor: {}, pricing: {}, payment: {}, bookingState: {}, bookingSubmission: {}, bookingLocation: {},
  });
  if (kind === 'navigation') content = h(load('features/passenger-navigation/PassengerNavigationInfoCard.tsx').PassengerNavigationInfoCard, {
    data, state: {}, presentation: {}, interruption: {}, tripActions: {},
  });
  const markup = renderToStaticMarkup(h(web.View, { style: { flex: 1, justifyContent: 'flex-end' } },
    h(web.Text, { style: { position: 'absolute', top: 70, alignSelf: 'center', color: '#536071' } }, 'Aperçu synthétique · attente avant embarquement'), content));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif}#root{height:100%;display:flex;flex-direction:column;background:#F4F7F9}</style><main id="root">${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/driver-wait-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try {
    for (const kind of ['request', 'trip', 'navigation']) for (const [width, height, fontScale] of [[390, 844, 1], [320, 568, 2]]) {
      const name = `${kind}-${width}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture(kind, width, height, fontScale));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState === 'complete' && !!document.getElementById('root')?.children.length", returnByValue: true })).result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const visible = el => { const r = el.getBoundingClientRect();
          if(r.width<1||r.height<1||r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)return false;
          for(let p=el.parentElement;p;p=p.parentElement){ const s=getComputedStyle(p), b=p.getBoundingClientRect();
            if(/hidden|auto|scroll/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))return false; } return true; };
        const action=document.querySelector('[aria-label="Changer de conducteur"]');
        const changeInitiallyVisible=!!action&&visible(action);
        const clipped=[...document.querySelectorAll('[role="button"]')].filter(el=>{ el.scrollIntoView({block:'nearest'});return !visible(el); }).map(el=>el.textContent);
        document.querySelectorAll('*').forEach(el=>{ if(el.scrollTop)el.scrollTop=0; });
        return {changeInitiallyVisible, clipped, overflow:document.documentElement.scrollWidth>innerWidth}; })()` })).result.value;
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      console.log(name, JSON.stringify(report));
      if (!report.changeInitiallyVisible || report.clipped.length || report.overflow) process.exitCode = 1;
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
