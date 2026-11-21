/* global __dirname */
// Local React Native Web preview, synthetic states only. No API or native-device claims.
const fs = require('node:fs'), path = require('node:path');
const { Buffer } = require('node:buffer');
const { pathToFileURL } = require('node:url');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const font = pathToFileURL(require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')).href;
const h = React.createElement;
const { passengerNavigationAvailability: resolve } = loader()('features/passenger-navigation/passengerNavigationAvailability.ts');
const states = {
  missing: { bookingError: { status: 404 } },
  expired: { tripError: { status: 404, data: { code: 'TRIP_EXPIRED' } } },
  network: { tripError: { status: 'FETCH_ERROR' } },
  completed: { booking: { id: 'preview', tripId: 'preview-trip', status: 'completed' } },
};
function fixture(screen, scale) {
  const { PassengerNavigationUnavailable } = loader({
    'react-native': { ...web, Text: ({ style, ...props }) => {
      const s = web.StyleSheet.flatten(style) || {};
      return h(web.Text, { ...props, style: [style, { fontSize: s.fontSize * scale, lineHeight: s.lineHeight ? s.lineHeight * scale : undefined }] });
    } },
    'react-native-safe-area-context': { SafeAreaView: ({ style, ...props }) => h(web.View, { ...props, style: [style, { paddingTop: 24, paddingBottom: 24 }] }) },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { fontFamily: 'PreviewIcons', fontSize: size, color } }, String.fromCodePoint(glyphs[name])) },
  })('features/passenger-navigation/PassengerNavigationUnavailable.tsx');
  const feedback = resolve({ bookingId: 'preview', online: true, loading: false, ...states[screen] }).feedback;
  const html = renderToStaticMarkup(h(PassengerNavigationUnavailable, {
    feedback, busy: false, online: true, active: true, onHome() {}, onBookings() {}, onRetry() {},
  }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:PreviewIcons;src:url('${font}')} ${web.StyleSheet.getSheet().textContent}html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{display:flex;height:100%;flex-direction:column}</style><main id="root">${html}</main></html>`;
}
async function main() {
  const executable = process.argv[2];
  if (!executable || !fs.existsSync(executable)) throw Error('Provide a local Chromium path');
  const dir = path.resolve(__dirname, '../.expo/navigation-availability-preview'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium(executable, fs.mkdtempSync(path.join(dir, 'session-')));
  try {
    for (const name of Object.keys(states)) for (const scale of [1, 2]) {
      const width = scale === 1 ? 390 : 320, height = scale === 1 ? 844 : 568;
      const file = path.join(dir, `${name}-${scale}.html`); fs.writeFileSync(file, fixture(name, scale));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      let report;
      for (let i = 0; i < 100; i++) {
        const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(()=>{const buttons=[...document.querySelectorAll('[role="button"]')];if(buttons.length<2)return null;return{width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,unreachable:buttons.filter(e=>{e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1||r.height<44}).map(e=>e.textContent)}})()` });
        report = r.result?.value; if (report) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!report || report.width !== width || report.overflow > 1 || report.unreachable.length) throw Error(`${name}-${scale}: ${JSON.stringify(report)}`);
      console.log(`${name}-${scale}`, report);
      await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>true)', awaitPromise: true });
      await send('Runtime.evaluate', { expression: "document.querySelectorAll('div').forEach(e=>e.scrollTop=0);window.scrollTo(0,0)" });
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, `${name}-${scale}.png`), Buffer.from(image.data, 'base64'));
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture };
