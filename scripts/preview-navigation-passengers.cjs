/* global __dirname */
// Actual RN-Web components, synthetic people and API. Not a native navigation test.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(width, height, scale, open) {
  let overlay = null;
  const load = loader({ react: { ...React, useState: () => React.useState(open) },
    'react-native': { ...web, useWindowDimensions: () => ({ width, height, fontScale: scale, scale: 1 }), Text: props => {
      const style = web.StyleSheet.flatten(props.style) ?? {};
      return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * scale,
        ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }] });
    } },
    'react-native-safe-area-context': { SafeAreaView: ({ edges: _edges, ...props }) => h(web.View, props) },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { fontSize: size, color, flexShrink: 0 } },
      ({ close: '×', 'people-outline': '♧', 'arrow-back': '←', 'refresh-outline': '↻' })[name] || '○') },
    // The native RideModal portals outside the header. Mirror that boundary,
    // otherwise RN-Web header stacking contexts overlap this fixture's sheet.
    '@/features/navigation/RideModal': { RideModal: ({ visible, children }) => {
      if (visible) overlay = children;
      return null;
    } },
    '@/hooks/trip-detail/useTripCoPassengers': { useTripCoPassengers: () => ({ eligible: true, online: true,
      participants: Array.from({ length: 8 }, (_, index) => ({ id: `fixture-${index}`, userId: `member-${index}`, firstName: index ? `Passager exemple ${index}` : 'Prénom composé très long', seats: index ? 1 : 2 })), refresh: noop }) },
    '@/hooks/trip-detail/useCoPassengerActions': { useCoPassengerActions: () => ({ profile: noop, message: noop, busy: false }) },
    './PassengerPickupEstimateBanner': { PassengerPickupEstimateBanner: () => null },
    '@/features/ride-payment/RidePaymentNotice': { RidePaymentNotice: () => null },
    '@/components/trip/TripShareAction': { TripShareAction: () => h(web.Text, null, 'Partager') },
  });
  const model = { data: { trip: { driverName: 'Conducteur exemple' }, insets: { top: 24, bottom: 16, left: 0, right: 0 },
    booking: {}, passengerId: 'fixture', tripId: 'fixture', bookingId: 'fixture', isScreenActive: true }, state: { isSocketConnected: true },
    presentation: { tripStatus: 'in_transit' }, tripActions: {} };
  const markup = renderToStaticMarkup(h(load('features/passenger-navigation/PassengerNavigationHeader.tsx').PassengerNavigationHeader,
    { model, assistance: { enabled: true } }));
  const overlayMarkup = overlay ? renderToStaticMarkup(h(web.View,
    { style: { position: 'fixed', inset: 0, zIndex: 10 } }, overlay)) : '';
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif}#root{min-height:100%;background:#dce9e3}
    .map-note{padding:24px;color:#5e697b;font-size:13px}</style><main id="root">${markup}<div class="map-note">Zone de carte illustrative · aucun GPS</div></main>${overlayMarkup}</html>`;
}

async function run() {
  const dir = path.resolve(__dirname, '../.expo/navigation-passengers-preview'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(dir, 'browser-')));
  try {
    for (const [width, height, scale, open] of [[390, 844, 1, false], [390, 844, 1, true], [320, 568, 2, false], [320, 568, 2, true]]) {
      const name = `${width}-${scale}-${open ? 'open' : 'closed'}`, file = path.join(dir, `${name}.html`);
      fs.writeFileSync(file, fixture(width, height, scale, open));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let n = 0; n < 50; n++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[aria-label=\"Autres passagers\"]')", returnByValue: true })).result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const visible = el => { const r=el.getBoundingClientRect(); return r.width>=44 && r.height>=44 && r.top>=0 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1; };
        const access=document.querySelector('[aria-label="Autres passagers"]');
        const close=[...document.querySelectorAll('[aria-label="Fermer la liste des passagers"]')].at(-1);
        const scroll=[...document.querySelectorAll('div')].find(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY));
        const target=${open} ? close : access, rect=target.getBoundingClientRect();
        return {horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
          actionVisible:visible(target), actionUncovered:target.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)),
          scrollHeight:scroll?.getBoundingClientRect().height};
      })()` })).result.value;
      const capture = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(capture.data, 'base64'));
      console.log(JSON.stringify({ name, ...report }));
      if (report.horizontalOverflow || !report.actionVisible || !report.actionUncovered || (open && report.scrollHeight < 60)) throw Error('Passenger layout failed');
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { fixture };
