/* Real decision content/actions through RN Web; synthetic map and account, no API/GPS. Not native validation. */
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

function renderFixture({ width = 390, height = 844, textScale = 1, fleet = false, expanded = false, selected = false } = {}) {
  const vehicles = [1, 2, 3, 4, 5].slice(0, fleet ? 5 : 1).map(i => ({ id: `test-${i}`, brand: 'Toyota', model: 'Corolla', licensePlate: `TEST-${i}` }));
  const chosen = !fleet || selected ? vehicles[0] : null;
  const model = { userId: 'preview-driver', requestedVehicleType: 'car', isIdentityVerified: true, canAcceptDirectly: true,
    canRespondToRequest: true, compatibleActiveVehicles: vehicles, directAcceptVehicle: chosen,
    directAcceptVehicleId: chosen?.id ?? '', handleDeclineTripRequest: noop, handleDirectAcceptTripRequest: noop,
    tripRequest: { id: 'preview-request', passengerName: 'Client exemple', numberOfSeats: 1, maxPricePerSeat: 3000,
      departureDateMin: new Date().toISOString(), paymentMode: 'cash' } };
  const native = { ...web, useWindowDimensions: () => ({ width, height, fontScale: textScale, scale: 1 }),
    StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(Object.entries(styles).map(([key, value]) => [key, {
      ...value, ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}), ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
    }]))) } };
  const Icon = ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { width: size, fontSize: size, color, textAlign: 'center' } },
    ({ 'arrow-back': '←', 'chevron-down': '⌄', 'car-outline': '▱', navigate: '➤', 'call-outline': '☎' })[name] ?? '•');
  const Map = ({ style }) => h(web.View, { style }, h('svg', {
    viewBox: '0 0 390 295', preserveAspectRatio: 'none', style: { width: '100%', height: '100%' },
  }, h('rect', { width: 390, height: 295, fill: '#E8EEE9' }),
  h('path', { d: 'M0 48L390 25M0 148L390 185M0 255L390 280M60 0L95 295M250 0L225 295M355 0L330 295', stroke: '#fff', strokeWidth: 12, fill: 'none' }),
  h('path', { d: 'M100 245L93 154L232 169L241 70L322 68', stroke: '#FF6B35', strokeWidth: 6, fill: 'none', strokeLinejoin: 'round' }),
  h('circle', { cx: 100, cy: 245, r: 9, fill: '#30805C', stroke: '#fff', strokeWidth: 3 }),
  h('rect', { x: 313, y: 59, width: 18, height: 18, rx: 4, fill: '#FF6B35', stroke: '#fff', strokeWidth: 3 })));
  const mocks = {
    'react-native': native, '@expo/vector-icons': { Ionicons: Icon },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => ({ departure: { title: 'Avenue des Aviateurs' }, arrival: { title: 'Avenue de la Victoire' } }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/navigation/useNavigationMapLifecycle': { useNavigationMapLifecycle: () => ({ shouldRenderMap: true, isMapReady: true, runMapCommand: noop }) },
    '@/utils/routeApi': { getRouteCoordinates: async () => { throw Error('No network in preview'); } },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 1, '@/assets/images/map-markers/trip-detail-marker-arrival.png': 2,
    'react-native-maps': { __esModule: true, default: Map, Marker: () => null, Polyline: () => null },
    '@/hooks/request-detail/useRequestResponseWindow': { useRequestResponseWindow: () => ({ label: 'Acceptez ou refusez cette demande', closed: false, blocked: false }) },
    '@/hooks/request-detail/useRequestPassengerContact': { useRequestPassengerContact: () => ({ disabled: false, open: noop }) },
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: () => null },
    '@/features/driver-payments/CashCommissionNotice': { CashCommissionNotice: () => h(web.Text, { style: { fontSize: 13, color: '#657080' } }, 'Commission cash : vérification à l’acceptation.') },
  };
  // Static states of the real picker; opening/selection callbacks are exercised in the JS tests.
  const picker = loader({ ...mocks, react: { ...React, useState: () => [expanded ? `${model.userId}:${model.tripRequest.id}` : null, noop] } })
    ('features/request-detail/RequestDecisionVehiclePicker.tsx');
  const load = loader({ ...mocks, './RequestDecisionVehiclePicker': picker });
  const { RequestDriverDecision, RequestDecisionActions } = load('features/request-detail/RequestDriverDecision.tsx');
  const { requestSummaryStyles: styles } = load('features/request-detail/requestSummaryStyles.ts');
  const departure = { latitude: -4.3, longitude: 15.3 }, arrival = { latitude: -4.32, longitude: 15.32 };
  const presentation = { requestRouteMapData: { departureCoordinate: departure, arrivalCoordinate: arrival,
    initialRegion: {}, fallbackCoordinates: [departure, arrival] }, displayedRouteCoordinates: [departure, { latitude: -4.31, longitude: 15.32 }, arrival] };
  const markup = renderToStaticMarkup(h(web.View, { style: { flex: 1, backgroundColor: '#EDF1F4' } },
    h(web.View, { style: [{ flexDirection: 'row', paddingHorizontal: 16, alignItems: 'center' }, styles.header] },
      h(web.Pressable, { style: [styles.back, { alignItems: 'center', justifyContent: 'center' }] }, h(Icon, { name: 'arrow-back', size: 24, color: '#111827' })),
      h(web.Text, { style: styles.headerTitle }, 'Nouvelle demande')),
    h(web.ScrollView, { testID: 'decision-scroll', style: styles.decisionScroll, contentContainerStyle: [styles.content, styles.decisionContent] },
      h(RequestDriverDecision, { model, presentation })), h(RequestDecisionActions, { model })));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif;background:#fff}
    #root{display:flex;flex-direction:column;width:${width}px;height:calc(100% - 48px);padding-top:24px}</style><main id="root">${markup}</main>
    <output id="layout-report" hidden></output><script>addEventListener('load',()=>{
      const rect=el=>el.getBoundingClientRect(), frame=rect(document.getElementById('root'));
      const footer=document.querySelector('[data-testid="request-decision-actions"]'), map=rect(document.querySelector('[data-testid="request-decision-map"]'));
      const inside=el=>{const r=rect(el);return r.height>0&&r.top>=frame.top&&r.bottom<=frame.bottom&&r.left>=frame.left&&r.right<=frame.right};
      const buttons=[...footer.querySelectorAll('[role="button"]')];
      const scroll=document.querySelector('[data-testid="decision-scroll"]');
      const arrival=document.querySelector('[aria-label="Destination. Avenue de la Victoire"]');
      const inDetails=()=>{const r=rect(arrival),s=rect(scroll);return r.top>=s.top&&r.bottom<=s.bottom};
      const arrivalInitiallyVisible=inDetails(); arrival.scrollIntoView({block:'nearest'});
      const arrivalReachable=inDetails(); document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0});
      document.getElementById('layout-report').textContent=JSON.stringify({width:innerWidth,height:innerHeight,mapHeight:Math.round(map.height),mapWidth:Math.round(map.width),
        footerHeight:Math.round(rect(footer).height),detailsHeight:Math.round(rect(scroll).height),arrivalInitiallyVisible,arrivalReachable,
        footerVisible:inside(footer),responseButtonsVisible:buttons.every(inside),horizontalOverflow:document.body.scrollWidth>innerWidth});
    });</script></html>`;
}

async function preview() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium executable.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-decision-preview-'));
  const session = await chromium(browser, directory);
  try { for (const scenario of [{ name: 'standard', width: 390, height: 844 }, { name: 'small', width: 320, height: 568 },
    { name: 'fleet-collapsed', width: 390, height: 844, fleet: true },
    { name: 'fleet-open', width: 390, height: 844, fleet: true, expanded: true },
    { name: 'fleet-selected', width: 390, height: 844, fleet: true, selected: true },
    { name: 'large-text-fleet', width: 320, height: 568, textScale: 1.5, fleet: true },
    { name: 'large-text-open', width: 320, height: 568, textScale: 1.5, fleet: true, expanded: true }]) {
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
    if (!geometry.footerVisible || !geometry.responseButtonsVisible || geometry.horizontalOverflow || geometry.mapWidth !== scenario.width
      || (!scenario.expanded && !geometry.arrivalReachable))
      throw Error(`Clipped layout: ${scenario.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); console.log(`Synthetic RN Web previews (not native): ${directory}`); }
}
if (require.main === module) void preview().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
