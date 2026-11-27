/* global __dirname */
// Actual reservation components; synthetic fixture and API result. RN-Web only.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};
function fixture(width, height, scale, error, pointState = 'ready') {
  const native = { ...web, useWindowDimensions: () => ({ width, height, fontScale: scale, scale: 1 }), Text: props => {
    const style = web.StyleSheet.flatten(props.style) ?? {};
    return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * scale,
      ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }] });
  } };
  const load = loader({ react: React, 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color, width: size, flexShrink: 0 }, 'aria-hidden': true },
      ({ close: '×', 'checkmark-circle': '●', 'card-outline': '▱', 'wallet-outline': '▣', 'cash-outline': '▤', 'chevron-down': '⌄', 'create-outline': '↗' })[name] || '○') },
    './tripDetailModel': { TRIP_PAYMENT_MODE_OPTIONS: ['cash', 'electronic', 'points'].map(id => ({ id, icon: 'card-outline' })) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/driverFinanceApi': { useTripPaymentOptionsQuery: () => ({ isError: error, refetch: noop, currentData: error ? undefined : {
      acceptedPaymentModes: ['cash', 'electronic', 'points'], availablePaymentModes: ['cash', 'electronic', 'points'],
    } }) },
    '@/components/forms/FormLayout': { FormModal: ({ children }) => h(web.View, { style: { ...web.StyleSheet.absoluteFillObject, backgroundColor: '#4C6370' } }, children) },
    '@/components/PassengerSeatNotice': { PassengerSeatNotice: () => null },
  });
  const { bookingPointLabel } = load('features/trip-detail/bookingLocationLabels.ts');
  const { getRouteStopLabel } = load('utils/routeLocationLabels.ts');
  const source = { lat: -4.31, lng: 15.28, name: 'Ma position actuelle' };
  const origin = pointState === 'ready' ? getRouteStopLabel({ address: '12 Avenue de Démonstration, Kinshasa' })
    : { ...getRouteStopLabel(source), isResolving: pointState === 'loading' };
  const props = { bookingModalVisible: true, insets: { bottom: 16 }, viewportHeight: height, trip: { id: 'synthetic', price: 5920 },
    bookingSeats: '2', bookingStep: 1, seatLimit: 2, estimatedTotal: 11840, bookingPaymentMode: 'cash', setBookingPaymentMode: noop,
    passengerOriginDisplay: 'Avenue des Aviateurs', passengerDestinationDisplay: '5 Avenue Adama, Kinshasa',
    bookingLocationLabels: { origin: bookingPointLabel(source, origin), destination: { text: 'Marché de démonstration' } },
    bookingProposedPrice: '', passengerOriginManualAddress: '', passengerDestinationManualAddress: '',
    closeBookingModal: noop, handleConfirmBooking: async () => {}, isIdentityVerified: true };
  if (pointState.startsWith('references')) {
    const context = load('features/trip-detail/bookingReferences.ts').bookingReferenceContext;
    const syntheticTrip = { id: 'synthetic', departure: { name: 'Gombe', lat: -4.31, lng: 15.28 },
      arrival: { name: 'Limete', lat: -4.33, lng: 15.32 } };
    props.bookingLocationLabels = { origin: { text: 'Gombe' }, destination: { text: 'Limete' } };
    props.bookingReferences = { origin: { ...context(syntheticTrip, 'origin', null, ''), value: '', onChangeText: noop },
      destination: { ...context(syntheticTrip, 'destination', null, ''), value: '', onChangeText: noop }, reset: noop };
    if (pointState === 'references-error') props.bookingModalError = 'Ajoutez un repère au départ : bâtiment, commerce ou avenue.';
  }
  const markup = renderToStaticMarkup(h(load('features/trip-detail/TripBookingModal.tsx').TripBookingModal, props));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif}#root{height:100%;display:flex;flex-direction:column}</style><main id="root">${markup}</main></html>`;
}
async function run() {
  const directory = path.resolve(__dirname, '../.expo/booking-payment-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try {
    for (const [width, height, scale, error, pointState = 'ready'] of [
      [390, 844, 1, false], [320, 568, 1, false], [320, 568, 2, false], [320, 568, 2, true],
      [390, 844, 1, false, 'loading'], [390, 844, 1, false, 'unavailable'], [320, 568, 2, false, 'unavailable'],
      [390, 844, 1, false, 'references'], [320, 568, 1, false, 'references'], [320, 568, 2, false, 'references-error'],
    ]) {
      const name = `${width}-${scale}-${error ? 'error' : 'ready'}-${pointState}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture(width, height, scale, error, pointState));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let n = 0; n < 50; n++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[role=radio]')", returnByValue: true })).result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const visible = el => { const r=el.getBoundingClientRect(); return r.height>=44 && r.top>=0 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1; };
        const radios=[...document.querySelectorAll('[role=radio]')];
        const confirm=[...document.querySelectorAll('[role=button]')].find(el=>el.textContent.includes('Confirmer la réservation'));
        const scroll=[...document.querySelectorAll('div')].find(el=>getComputedStyle(el).overflowY==='auto' || getComputedStyle(el).overflowY==='scroll');
        return {choicesVisible:radios.length===3 && radios.every(visible), confirmVisible:!!confirm && visible(confirm),
          scrollHeight:scroll?.getBoundingClientRect().height, horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
      })()` })).result.value;
      const capture = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from(capture.data, 'base64'));
      report.routeReachable = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const route=document.querySelector('[aria-label="Modifier le point de départ"]');
        route.scrollIntoView({block:'nearest'}); const r=route.getBoundingClientRect();
        return r.top>=0 && r.bottom<=innerHeight;
      })()` })).result.value;
      if (pointState.startsWith('references')) {
        report.referencesReachable = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const fields=[...document.querySelectorAll('input[aria-label^="Repère"]')];
          return fields.length===2 && fields.every(field => {
            field.scrollIntoView({block:'nearest'}); const r=field.getBoundingClientRect();
            return r.height>=44 && r.top>=0 && r.bottom<=innerHeight && r.right<=innerWidth;
          });
        })()` })).result.value;
        if (!report.referencesReachable) throw Error('Unreachable reference fields: ' + name);
      }
      console.log(JSON.stringify({ name, ...report }));
      if (!report.choicesVisible || !report.confirmVisible || !report.routeReachable || report.horizontalOverflow || report.scrollHeight < 64) throw Error(`Layout check failed: ${name}`);
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
