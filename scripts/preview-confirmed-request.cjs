/* global __dirname */
// Actual screen, styles and change-driver button. Synthetic map/data; no network or native validation.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const fixture = require('../tests/helpers/confirmedRequestFixture.cjs');
const h = React.createElement, noop = () => {};

function render({ width, height, scale = 1, waited = false, references = false }) {
  const native = { ...web, useWindowDimensions: () => ({ width, height, fontScale: scale }), Text: props => {
    const style = web.StyleSheet.flatten(props.style) ?? {}, ratio = Math.min(scale, props.maxFontSizeMultiplier ?? scale);
    return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * ratio,
      ...(style.lineHeight ? { lineHeight: style.lineHeight * ratio } : {}) }] });
  } };
  const Icon = ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { fontSize: size, width: size, flexShrink: 0, color, textAlign: 'center' } },
    ({ 'arrow-back': '←', 'checkmark-circle': '✓', 'close-circle-outline': '⊗', 'navigate-outline': '➤', 'time-outline': '◷', 'locate-outline': '⌖' })[name] ?? '•');
  const Map = ({ style }) => h(web.View, { style }, h('svg', { viewBox: '0 0 390 250', preserveAspectRatio: 'none', style: { width: '100%', height: '100%' } },
    h('rect', { width: 390, height: 250, fill: '#E8EEE9' }),
    h('path', { d: 'M0 48L390 25M0 148L390 185M0 230L390 248M60 0L95 250M250 0L225 250M355 0L330 250', stroke: '#FFF', strokeWidth: 12, fill: 'none' }),
    h('path', { d: 'M100 210L93 154L232 169L241 70L322 68', stroke: '#D54100', strokeWidth: 6, fill: 'none', strokeLinejoin: 'round' }),
    h('circle', { cx: 100, cy: 210, r: 9, fill: '#17854B', stroke: '#FFF', strokeWidth: 3 }),
    h('rect', { x: 313, y: 59, width: 18, height: 18, rx: 4, fill: '#D54100', stroke: '#FFF', strokeWidth: 3 })));
  const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: Icon },
    'react-native-safe-area-context': { SafeAreaView: web.View },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => references ? {
      departure: { ...fixture.labels.departure, reference: 'Devant la pharmacie' }, arrival: { ...fixture.labels.arrival, reference: 'Entrée principale' },
    } : fixture.labels },
    '@/hooks/request-detail/useConfirmedRequestPickup': { useConfirmedRequestPickup: () => ({ enabled: true, loading: false,
      pickup: { person: { name: fixture.request.selectedDriverName }, status: 'waiting_location' } }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/navigation/useNavigationMapLifecycle': { useNavigationMapLifecycle: () => ({ shouldRenderMap: true, isMapReady: true, runMapCommand: noop }) },
    '@/utils/routeApi': { getRouteCoordinates: async () => { throw Error('No network in preview'); } },
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 1, '@/assets/images/map-markers/trip-detail-marker-arrival.png': 2,
    'react-native-maps': { __esModule: true, default: Map, Marker: () => null, Polyline: () => null },
    './RequestOwnerModals': { RequestOwnerModals: () => null },
    'expo-router': { useRouter: () => ({}) }, '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: noop }) },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: fixture.request.passengerId } } }), useAppDispatch: () => noop },
    '@/store/api/requestDriverApi': { useChangeRequestDriverMutation: () => [noop, { isLoading: false }] },
    '@/store/api/tripRequestApi': {}, '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active },
    '@/hooks/request-detail/useRequestDriverWait': { useRequestDriverWait: () => waited },
  });
  const Screen = load('features/request-detail/RequestConfirmedScreen.tsx').RequestConfirmedScreen;
  const markup = renderToStaticMarkup(h(Screen, { model: fixture.model, presentation: fixture.presentation }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif;background:#fff}
    #root{display:flex;flex-direction:column;height:calc(100% - 48px);padding:24px 0}</style><main id="root">${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/confirmed-request-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  const cases = [{ name: 'standard', width: 390, height: 844, references: true }, { name: 'small', width: 320, height: 568 },
    { name: 'waited', width: 390, height: 844, waited: true }, { name: 'large', width: 320, height: 568, scale: 2, references: true },
    { name: 'landscape', width: 844, height: 390 }];
  try { for (const c of cases) {
    const file = path.join(directory, `${c.name}.html`); fs.writeFileSync(file, render(c));
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: c.width, height: c.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    for (let i = 0; i < 50; i++) {
      if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[data-testid=confirmed-request-content]')", returnByValue: true })).result?.value) break;
      await new Promise(r => setTimeout(r, 50));
    }
    const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const body=document.querySelector('[data-testid=confirmed-request-content]'),footer=document.querySelector('[data-testid=confirmed-request-actions]');
      const map=document.querySelector('[data-testid=request-decision-map]').getBoundingClientRect();
      const inside=el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth};
      const result={mapVisible:map.top>=0&&map.bottom<=innerHeight,mapHeight:map.height,bodyOverflow:body.scrollHeight-body.clientHeight,
        footerVisible:inside(footer),actionsVisible:[...footer.querySelectorAll('[role=button]')].every(inside),horizontal:document.body.scrollWidth>innerWidth,unreachable:[]};
      for(const parent of [body,footer])for(const el of parent.querySelectorAll('[dir=auto],[role=button]')){
        el.scrollIntoView({block:'end',inline:'nearest'});const r=el.getBoundingClientRect(),p=parent.getBoundingClientRect();
        if(r.bottom>p.bottom+1||r.bottom<p.top||r.left<0||r.right>innerWidth)result.unreachable.push(el.textContent);
      }
      document.querySelectorAll('*').forEach(el=>{el.scrollTop=0;el.scrollLeft=0});return result;})()` })).result.value;
    console.log(c.name, JSON.stringify(report));
    fs.writeFileSync(path.join(directory, `${c.name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
    if (!report.mapVisible || !report.footerVisible || report.horizontal || report.unreachable.length ||
        (!c.scale && c.name !== 'landscape' && (report.bodyOverflow > 1 || !report.actionsVisible))) process.exitCode = 1;
    await browser.send('Target.closeTarget', { targetId });
  } } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
