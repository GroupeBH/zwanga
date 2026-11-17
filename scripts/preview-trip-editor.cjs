/* global __dirname */
// Actual editor components, synthetic data, React Native Web; NOT a native or API test.
const fs = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { pathToFileURL } = require('node:url');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { tripEditorFixture } = require('../tests/helpers/tripEditorFixture.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement;
function renderFixture({ width, textScale = 1, os = 'android', references = false, manual = false,
  noVehicle = false, negotiated = false, reprogram = false, loading = false, referenceValue = '' }) {
  const props = tripEditorFixture();
  if (references) {
    props.editDepartureSelection = { ...props.editDepartureSelection, title: 'Gombe', address: 'Gombe' };
    props.editArrivalSelection = { ...props.editArrivalSelection, title: 'Limete', address: 'Limete' };
    props.editDepartureDisplay = props.editDepartureManualAddress = 'Gombe';
    props.editArrivalDisplay = props.editArrivalManualAddress = 'Limete';
  }
  if (manual) props.editRouteMode = 'manual';
  props.editReferences.departureReference = referenceValue;
  if (noVehicle) { props.editVehicleId = null; props.activeEditVehicles = []; }
  if (negotiated) props.trip.tripRequestId = 'request-test';
  props.trip.canReprogram = reprogram; props.editVehiclesLoading = loading;
  const load = loader({ 'react-native': { ...web, Platform: { OS: os },
    StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
      Object.entries(styles).map(([key, value]) => [key, { ...value,
        ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
        ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
      }]))),
    },
  }, '@/components/forms/FormLayout': {
    FormModal: ({ children }) => h(web.View, { style: { flex: 1, minHeight: 0 } }, children),
  }, '@react-native-community/datetimepicker': { __esModule: true, default: web.View },
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
    style: { fontSize: size, color, width: size, textAlign: 'center', flexShrink: 0 } },
  ({ close: '×', 'swap-vertical': '↕', 'chevron-down': '⌄', 'locate-outline': '◎', 'location-outline': '♧',
    'calendar-outline': '▦', 'time-outline': '◷', 'pencil-outline': '✎', 'car-outline': '▱' })[name] ?? '◇') },
  });
  const html = renderToStaticMarkup(h(load('features/trip-detail/TripEditModal.tsx').TripEditModal, props));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    html,body{height:100%;margin:0;background:#eef2f6;font-family:Arial,sans-serif}
    #root{display:flex;flex-direction:column;width:${width}px;max-width:100%;height:calc(100% - 48px);padding-top:24px;margin:auto}
    </style><main id="root">${html}</main></html>`;
}
async function run() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium browser path.');
  const directory = path.resolve(__dirname, '../.expo/trip-editor-preview'); fs.mkdirSync(directory, { recursive: true });
  const scenarios = [
    { width: 390, height: 844, name: 'standard' }, { width: 360, height: 800, name: 'medium' },
    { width: 320, height: 568, name: 'small' }, { width: 320, height: 568, textScale: 1.5, name: 'large-text' },
    { width: 844, height: 390, name: 'landscape' }, { width: 390, height: 844, os: 'ios', name: 'ios-layout' },
    { width: 360, height: 800, references: true, name: 'references' },
    { width: 320, height: 568, references: true, manual: true, name: 'manual-references' },
    { width: 360, height: 500, manual: true, name: 'reduced-height' },
    { width: 320, height: 568, noVehicle: true, name: 'no-vehicle' },
    { width: 320, height: 568, negotiated: true, name: 'negotiated' },
    { width: 320, height: 568, reprogram: true, name: 'reprogram' },
    { width: 320, height: 568, loading: true, name: 'loading' },
    ...['android', 'ios'].flatMap(os => ['', 'P', 'Pharmacie'].map((referenceValue, index) => ({
      width: 360, height: 500, os, references: true, referenceValue, name: `keyboard-reference-${os}-${index}`,
    }))),
  ];
  const session = await chromium(browser, fs.mkdtempSync(path.join(directory, 'session-'))), reports = [];
  try { for (const scenario of scenarios) {
    const file = path.join(directory, `${scenario.name}.html`); fs.writeFileSync(file, renderFixture(scenario));
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const scroll=document.querySelector('[data-testid="trip-edit-content"]'),footer=document.querySelector('[data-testid="trip-edit-footer"]');
        if(!scroll || !footer) return null;
        const inside=el=>{const r=el.getBoundingClientRect();return r.height>0&&r.top>=23&&r.bottom<=innerHeight-23&&r.left>=0&&r.right<=innerWidth+1};
        const footerVisible=inside(footer),closeVisible=inside(document.querySelector('[aria-label="Fermer sans enregistrer"]'));
        const horizontalOverflow=Math.max(scroll.scrollWidth-scroll.clientWidth,document.documentElement.scrollWidth-innerWidth);
        const controlsReachable=[...scroll.querySelectorAll('[role="button"],input,[role="switch"]')].every(el=>{
          el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect(),s=scroll.getBoundingClientRect();
          return inside(el)&&r.top>=s.top-1&&r.bottom<=s.bottom+1;
        });scroll.scrollTop=0;
        return {footerVisible,closeVisible,horizontalOverflow,controlsReachable,scrollRemaining:scroll.scrollHeight-scroll.clientHeight,
          footerTop:footer.getBoundingClientRect().top,footerBottom:footer.getBoundingClientRect().bottom};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report) throw Error(`Missing layout: ${scenario.name}`);
    console.log(scenario.name, JSON.stringify(report)); reports.push({ ...scenario, ...report });
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
    if (!report.footerVisible || !report.closeVisible || report.horizontalOverflow > 1 || !report.controlsReachable) throw Error(`Clipped controls: ${scenario.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); }
  for (const os of ['android', 'ios']) {
    const samples = reports.filter(report => report.name.startsWith(`keyboard-reference-${os}-`));
    if (samples.some(report => Math.abs(report.footerTop - samples[0].footerTop) > 1 ||
      Math.abs(report.footerBottom - samples[0].footerBottom) > 1 || report.scrollRemaining !== samples[0].scrollRemaining)) {
      throw Error(`Reference typing changed the reduced-height layout: ${os}`);
    }
  }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
  console.log(`Synthetic web previews only: ${directory}`);
}
if (require.main === module) void run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
