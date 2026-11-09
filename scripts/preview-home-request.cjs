/* global __dirname */
// Real Home order UI, React Native Web + synthetic state. Map/native APIs are simulated.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { homeRequestFixture, homeRequestBoundaryMocks } = require('../tests/helpers/homeRequestFixture.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const noop = () => {}, h = React.createElement;

function renderFixture({ width, height, textScale = 1, planned = false, missingGps = false, arrivalPicker = false, searching = false }) {
  const form = homeRequestFixture(planned ? { timePreset: 'custom' } : {});
  if (missingGps) Object.assign(form, { departureLocation: null, departureAddress: '', requestFormStep: 'route' });
  if (arrivalPicker) form.arrivalLocation = null;
  const pickerTarget = arrivalPicker ? 'arrival' : missingGps ? 'departure' : null;
  const boundary = { ...homeRequestBoundaryMocks };
  delete boundary['@/components/LocationPickerModal']; // Render the actual inline picker, not an invisible modal mock.
  const native = { ...web, Platform: { OS: 'android', select: value => value.android ?? value.default },
    useWindowDimensions: () => ({ width, height, fontScale: textScale }),
    StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
      Object.entries(styles).map(([key, value]) => [key, { ...value,
        ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
        ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
      }]))),
    },
  };
  const load = loader({ ...boundary, 'react-native': native,
    '@/assets/images/map-markers/trip-detail-marker-departure.png': 1,
    '@/assets/images/map-markers/trip-detail-marker-arrival.png': 2,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ data: [] }) },
    '@/store/api/googleMapsApi': { useGetLandmarksQuery: () => ({ data: [] }) },
    '@/hooks/location-picker/useLocationPicker': { useLocationPicker: () => ({
      selection: { title: 'Point sur la carte', address: 'Rue de démonstration' }, cameraTarget: {}, route: [],
      query: '', searchOpen: searching, suggestions: [], searching: false, resolving: false, locating: false,
      panning: false, addressLoading: false, notice: null, setQuery: noop, openSearch: noop, closeSearch: noop,
      choose: noop, locate: noop, resolvePlace: noop, selectLandmark: noop, startPanning: noop, settleMap: noop,
      confirm: noop, close: noop,
    }) },
    '@/components/location-picker/LocationPickerMap': { LocationPickerMap: () => h(web.View,
      { style: { ...web.StyleSheet.absoluteFillObject, backgroundColor: '#E8EEEA', justifyContent: 'center', alignItems: 'center' } },
      h(web.Text, { style: { color: '#66756B', fontSize: 13 } }, 'CARTE SIMULÉE · choisir un point')) },
    '@/components/forms/FormLayout': { FormScreen: ({ children, style }) => h(web.View, { style: [{ flex: 1, minHeight: 0 }, style] }, children) },
    '@/utils/reanimated': { __esModule: true, default: { View: web.View }, FadeIn: {}, FadeOut: {} },
    '@/hooks/trip-request/useHomeRequestFlow': { useHomeRequestFlow: () => ({ locked: false, openPicker: noop,
      pickerTarget, closePicker: noop, onSelect: noop, handleBack: noop, submit: noop,
      pickup: { status: missingGps ? 'unavailable' : 'ready', source: 'gps' } }) },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
      style: { fontSize: size, color, width: size, textAlign: 'center', flexShrink: 0 } },
    ({ 'chevron-back': '‹', add: '+', remove: '−', 'chevron-down': '⌄', 'pencil-outline': '↗', ellipse: '●', location: '♦' })[name] ?? '◇') },
    'react-native-maps': { __esModule: true, default: props => h(web.View, { style: [props.style, { backgroundColor: '#E8EEEA', justifyContent: 'center', alignItems: 'center' }] },
      h(web.Text, { style: { color: '#66756B', fontSize: 13 } }, 'CARTE SIMULÉE · aperçu de mise en page')), Marker: () => null, Polyline: () => null },
  });
  const { HomeRequestScreen } = load('components/trip-request/HomeRequestScreen.tsx');
  const html = renderToStaticMarkup(h(HomeRequestScreen, { form, navigation: { scrollRef: { current: null }, handleBack: noop } }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    html,body{height:100%;margin:0;background:#eef2f6;font-family:Arial,sans-serif}#root{display:flex;flex-direction:column;width:${width}px;max-width:100%;height:calc(100% - 48px);padding-top:24px;margin:auto}
    </style><main id="root">${html}</main></html>`;
}

async function run() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium browser path.');
  const directory = path.resolve(__dirname, '../.expo/home-request-preview');
  fs.mkdirSync(directory, { recursive: true });
  const scenarios = [
    { width: 390, height: 844, name: 'review-390' }, { width: 360, height: 800, name: 'review-360' },
    { width: 320, height: 568, name: 'review-small' }, { width: 320, height: 568, textScale: 1.5, name: 'large-text' },
    { width: 390, height: 844, planned: true, name: 'planned' },
    { width: 320, height: 568, missingGps: true, name: 'gps-fallback' },
    { width: 390, height: 844, missingGps: true, name: 'gps-fallback-390' },
    { width: 320, height: 568, textScale: 1.5, missingGps: true, name: 'gps-large-text' },
    { width: 390, height: 844, arrivalPicker: true, name: 'destination' },
    { width: 320, height: 568, textScale: 1.5, arrivalPicker: true, name: 'destination-large-text' },
    { width: 320, height: 568, arrivalPicker: true, searching: true, name: 'destination-search' },
  ];
  // Render before launching: HTML artifacts remain inspectable if Chromium is unavailable.
  for (const scenario of scenarios) fs.writeFileSync(path.join(directory, `${scenario.name}.html`), renderFixture(scenario));
  const session = await chromium(browser, fs.mkdtempSync(path.join(directory, 'session-')));
  try { for (const scenario of scenarios) {
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(path.join(directory, `${scenario.name}.html`)).href });
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const scroll=document.querySelector('[data-testid="home-request-content"]'), workspace=document.querySelector('[data-testid="location-picker-workspace"]');
        const footer=document.querySelector('[data-testid="home-request-footer"],[data-testid="location-picker-footer"]');
        if(!(scroll || workspace) || !footer) return null;
        const rect=el=>el.getBoundingClientRect();
        const inside=el=>{const r=rect(el);return r.height>0&&r.top>=24&&r.bottom<=innerHeight-24&&r.left>=0&&r.right<=innerWidth};
        const footerVisible=inside(footer), footerBottom=rect(footer).bottom, horizontalOverflow=Math.max(scroll ? scroll.scrollWidth-scroll.clientWidth : 0,document.documentElement.scrollWidth-innerWidth);
        const controlsReachable=[...(scroll || document).querySelectorAll('[role="button"],[role="radio"],[role="checkbox"]')].every(el=>{el.scrollIntoView({block:'nearest',inline:'nearest'});return inside(el)});
        if(scroll) scroll.scrollTop=0;
        return {footerVisible,footerBottom,horizontalOverflow,controlsReachable,scrollRemaining:scroll ? scroll.scrollHeight-scroll.clientHeight : 0,
          ...(workspace ? {mapHeight:rect(workspace).height,mapVisible:inside(workspace)} : {})};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(scenario.name, JSON.stringify(report));
    if (!report?.footerVisible || report.horizontalOverflow > 1 || !report.controlsReachable || report.mapVisible === false) process.exitCode = 1;
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(shot.data, 'base64'));
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
