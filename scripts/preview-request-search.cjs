/* Real search panel + actions via RN Web. Synthetic map/positions, no API or GPS, not native validation. */
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { Buffer } = require('node:buffer');
const { pathToFileURL } = require('node:url');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};
const now = Date.now();
const image = name => `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../assets/images/map-markers', name)).toString('base64')}`;

function renderFixture({ empty = false, textScale = 1, width = 390 } = {}) {
  const model = { isScreenActive: true, canCancel: true, canEdit: true, goHome: noop, refetch: noop,
    handleCancelRequest: noop, handleOpenEditForm: noop, tripRequest: { id: 'preview-request', status: 'pending', passengerId: 'preview-owner',
      vehicleType: 'car', numberOfSeats: 1, maxPricePerSeat: 3000, departureDateMin: new Date(now + 3600000).toISOString(),
      departureDateMax: new Date(now + 5400000).toISOString() } };
  const vehicles = empty ? [] : ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'].map((vehicleType, i) => ({
    id: `preview-${i}`, latitude: -4.3 + i / 1000, longitude: 15.3, vehicleType, positionUpdatedAt: new Date(now - i * 3600000).toISOString(),
  }));
  const native = { ...web, StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
    Object.entries(styles).map(([key, value]) => [key, { ...value,
      ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
      ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
    }]))),
  } };
  const Icon = ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { fontSize: size, color, width: size, textAlign: 'center' } },
    ({ 'arrow-back': '←', 'chevron-down': '⌄', 'radio-button-on': '●', location: '●' })[name] ?? '•');
  const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: Icon },
    'react-native-safe-area-context': { SafeAreaView: web.View },
    '@/hooks/useUserLocation': { useUserLocation: () => ({ lastKnownLocation: null }) },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => ({ departure: { title: 'Avenue des Aviateurs' }, arrival: { title: 'Avenue de la Victoire' } }) },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: true } } }) },
    '@/store/api/requestSearchApi': { useGetRequestSearchMapQuery: () => ({ fulfilledTimeStamp: now, refetch: noop,
      currentData: { requestId: model.tripRequest.id, searching: true, generatedAt: new Date(now).toISOString(), vehicles, total: vehicles.length } }) },
    '@/hooks/request-detail/useRequestResponseWindow': { useRequestResponseWindow: () => ({}) },
    './RequestTargetDriver': { RequestTargetDriver: () => null }, './SharedTripPanel': { SharedTripPanel: () => null },
    './CollapsibleRouteMap': { CollapsibleRouteMap: () => null }, './RequestOwnerModals': { RequestOwnerModals: () => null },
    './RequestSearchMap': { RequestSearchMap: () => h(web.View, { testID: 'preview-map', style: { flex: 1, minHeight: 120, overflow: 'hidden', backgroundColor: '#EAF0E9' } },
      h('svg', { viewBox: '0 0 390 560', preserveAspectRatio: 'none', style: { position: 'absolute', width: '100%', height: '100%' } },
        h('path', { d: 'M-20 90L420 150M-20 240L420 200M-20 380L420 440M60-20L90 590M280-20L200 590', stroke: '#fff', strokeWidth: 12, fill: 'none' }),
        h('path', { d: 'M-20 0L100 0L390 90L390 0Z', fill: '#B5E0E8' })),
      h(web.Text, { style: { position: 'absolute', top: 95, left: 30, color: '#718078', fontSize: 13 } }, 'GOMBE'),
      h(web.View, { style: { position: 'absolute', top: '47%', left: '46%', width: 22, height: 22, borderRadius: 11, borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: '#FF6B35' } }),
      ...vehicles.map((vehicle, i) => h('img', { key: vehicle.id, alt: vehicle.vehicleType, src: image(['trip-marker-car.png', 'trip-marker-moto-v2.png', 'trip-marker-tricycle-v2.png'][i]),
        style: { position: 'absolute', left: `${[25, 70, 40][i]}%`, top: `${[25, 43, 68][i]}%`, width: 38, height: 44, objectFit: 'contain', opacity: i ? .55 : 1 } })),
      h(web.Text, { style: { position: 'absolute', bottom: 30, left: 16, padding: 10, borderRadius: 22, backgroundColor: 'white', fontSize: 12, color: '#283141' } }, '● Votre départ choisi'),
      h(web.Text, { style: { position: 'absolute', bottom: 30, right: 16, padding: 10, borderRadius: 22, backgroundColor: 'white', fontSize: 18 } }, '◎')) },
  });
  const Screen = load('features/request-detail/RequestSearchScreen.tsx').RequestSearchScreen;
  const markup = renderToStaticMarkup(h(Screen, { model, presentation: { requestRouteMapData: { departureCoordinate: { latitude: -4.3, longitude: 15.3 } } }, onLayout: noop }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif;background:#fff}
    #root{display:flex;flex-direction:column;width:${width}px;height:calc(100% - 48px);padding-top:24px}</style><main id="root">${markup}</main>
    <output id="layout-report" hidden></output><script>addEventListener('load',()=>{
      const rect=el=>el.getBoundingClientRect(), frame=rect(document.getElementById('root'));
      const buttons=[...document.querySelectorAll('[role="button"]')];
      const inside=el=>{const r=rect(el);return r.width>0&&r.height>0&&r.top>=frame.top&&r.bottom<=frame.bottom&&r.left>=frame.left&&r.right<=frame.right};
      const map=rect(document.querySelector('[data-testid="preview-map"]'));
      document.getElementById('layout-report').textContent=JSON.stringify({width:innerWidth,height:innerHeight,mapHeight:Math.round(map.height),
        panelHeight:Math.round(rect(document.querySelector('[data-testid="request-search-panel"]')).height),
        allActionsVisible:buttons.every(inside),horizontalOverflow:document.body.scrollWidth>innerWidth});
    });</script></html>`;
}

async function preview() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium/Edge executable.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-search-preview-'));
  const session = await chromium(browser, directory);
  try { for (const scenario of [{ name: 'vehicles', width: 390, height: 844 }, { name: 'empty', width: 390, height: 844, empty: true },
    { name: 'small', width: 320, height: 568 }, { name: 'large-text', width: 320, height: 568, textScale: 1.5 }]) {
    const file = path.join(directory, `${scenario.name}.html`);
    fs.writeFileSync(file, renderFixture(scenario));
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let i = 0; i < 100 && !report; i++) {
      report = (await send('Runtime.evaluate', { expression: "document.getElementById('layout-report')?.textContent", returnByValue: true })).result?.value;
      if (!report) await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report) throw Error('Preview did not render.');
    const geometry = JSON.parse(report); console.log(scenario.name, geometry);
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(capture.data, 'base64'));
    if (!geometry.allActionsVisible || geometry.horizontalOverflow || geometry.mapHeight < 120) throw Error(`Clipped layout: ${scenario.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); console.log(`Synthetic RN Web previews (not native): ${directory}`); }
}
if (require.main === module) void preview().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
