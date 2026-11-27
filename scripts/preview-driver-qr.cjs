/* global __dirname */
// Synthetic fixtures only: React Native Web + zwanga-web component, no user/API/network data.
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { pathToFileURL } = require('node:url');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const QRCode = require('qrcode');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement;
const id = '11111111-1111-4111-8111-111111111111';
const card = { id, firstName: 'Conducteur', lastName: 'Démo', profilePicture: null,
  driverCategory: 'transport', isPhoneVerified: true, completedTrips: 12, averageRating: 4.5, totalRatings: 3,
  vehicles: [{ type: 'car', brand: 'Voiture', model: 'Démo', color: 'Bleu', licensePlate: 'TEST' }],
  credits: [{ assetKind: 'phone', status: 'active' }, { assetKind: 'vehicle', status: 'settled' }],
};
const noop = () => {};
function qrSvg({ value, size, quietZone }) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
  return h('svg', { width: size + quietZone * 2, height: size + quietZone * 2, viewBox: `-4 -4 ${modules.size + 8} ${modules.size + 8}` },
    h('rect', { x: -4, y: -4, width: modules.size + 8, height: modules.size + 8, fill: 'white' }),
    ...Array.from({ length: modules.size ** 2 }, (_, n) => modules.get(Math.floor(n / modules.size), n % modules.size) ?
      h('rect', { key: n, x: n % modules.size, y: Math.floor(n / modules.size), width: 1, height: 1, fill: 'black' }) : null));
}
function renderMobile({ width, textScale = 1 }) {
  const native = { ...web, Platform: { OS: 'android' }, useWindowDimensions: () => ({ width }),
    StyleSheet: { ...web.StyleSheet, create: values => web.StyleSheet.create(Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, { ...value,
        ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
        ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
      }]))),
    },
  };
  const load = loader({ 'react-native': native, 'react-native-qrcode-svg': qrSvg,
    '@/config/env': { PUBLIC_WEB_URL: 'https://web.example.test' },
    '@/store/api/publicDriverApi': { useGetPublicDriverCardQuery: () => ({ currentData: card, isFetching: false, refetch: noop }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 }, '@/utils/shareDriverQr': { shareDriverQr: noop },
  });
  const { DriverQrContent } = load('features/driver-qr/DriverQrContent.tsx');
  const html = renderToStaticMarkup(h(web.View, { style: { flex: 1 } },
    h(web.Text, { style: { fontSize: 21 * textScale, fontWeight: '700', padding: 16 } }, '‹  Mon QR conducteur'), h(DriverQrContent, { driverId: id })));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}html,body{height:100%;margin:0;background:white;font-family:Arial,sans-serif}
    #root{display:flex;flex-direction:column;height:calc(100% - 48px);padding-top:24px}</style><main id="root">${html}</main></html>`;
}
async function run() {
  const directory = path.resolve(__dirname, '../.expo/driver-qr-preview'); fs.mkdirSync(directory, { recursive: true });
  const site = path.resolve(__dirname, '../../zwanga-web');
  const publicModel = loader()(path.join(site, 'lib/public-driver.ts'));
  const classes = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : key });
  // Fixture uses the mobile renderer's React runtime; the website has its own React version.
  const { DriverPublicCard } = loader({ '@/lib/public-driver': publicModel, './profile.module.css': classes,
    'react/jsx-runtime': require('react/jsx-runtime') })(path.join(site, 'app/conducteurs/[id]/DriverPublicCard.tsx'));
  const css = fs.readFileSync(path.join(site, 'app/styles/globals.css'), 'utf8') + fs.readFileSync(path.join(site, 'app/conducteurs/[id]/profile.module.css'), 'utf8');
  const renderDriverCard = value => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-inter:Arial;--font-serif:Georgia}</style><main class="page"><header class="header"><span class="brand">Zwanga</span>Fiche publique</header>${value ? renderToStaticMarkup(h(DriverPublicCard, { card: value })) : '<h1>Fiche indisponible</h1><p>Ce profil conducteur n’est plus accessible.</p>'}</main></html>`;
  const scenarios = [
    { name: 'mobile-standard', width: 390, height: 844 }, { name: 'mobile-small', width: 320, height: 568 },
    { name: 'mobile-large-text', width: 320, height: 568, textScale: 1.5 },
    { name: 'public-standard', width: 390, height: 844, public: true }, { name: 'public-small', width: 320, height: 568, public: true },
    { name: 'public-empty', width: 320, height: 568, public: true, empty: true },
  ];
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'session-')));
  const reports = [];
  try { for (const scenario of scenarios) {
    const filename = path.join(directory, `${scenario.name}.html`);
    fs.writeFileSync(filename, scenario.public ? renderDriverCard(scenario.empty ? undefined : card) : renderMobile(scenario));
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    await send('Page.navigate', { url: pathToFileURL(filename).href });
    let report;
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        if(!document.querySelector('main')) return null;
        const overflow=document.documentElement.scrollWidth-innerWidth;
        const controls=[...document.querySelectorAll('[role="button"]')];
        const reachable=controls.every(el=>{el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth+1});
        document.querySelector('svg')?.scrollIntoView({block:'center'});
        return {horizontalOverflow:overflow,controlsReachable:reachable,buttons:controls.length};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report || report.horizontalOverflow > 1 || !report.controlsReachable) throw Error(`Layout failed: ${scenario.name}: ${JSON.stringify(report)}`);
    const png = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(png.data, 'base64'));
    reports.push({ ...scenario, ...report }); console.log(scenario.name, report);
    await browser.send('Target.closeTarget', { targetId });
  } } finally { await browser.close(); }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
}
if (require.main === module) void run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderMobile };
