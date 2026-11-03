// Actual components through RN Web, synthetic state only. Not native/device validation.
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

function renderFixture({ width, scale = 1, prompt = false, busy = false, multi = false, report = false, error = false, passenger = false, empty = false }) {
  const native = { ...web, Platform: { OS: 'android', select: o => o.android ?? o.default },
    StyleSheet: { ...web.StyleSheet, create: values => web.StyleSheet.create(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
      ...value, ...(value.fontSize ? { fontSize: value.fontSize * scale } : {}), ...(value.lineHeight ? { lineHeight: value.lineHeight * scale } : {}),
    }]))) } };
  const people = [{ id: 'preview-one', name: 'Camille Exemple', seats: 1 }, ...(multi ? [{ id: 'preview-two', name: 'Alex Démonstration', seats: 1 }] : [])];
  const trip = { id: 'preview-trip', driverId: 'preview-driver', driverName: 'Conducteur exemple',
    departure: { name: 'Point de départ de démonstration' }, arrival: { name: 'Destination de démonstration' } };
  const data = { active: true, ratingScopeKey: 'preview', activeTab: report ? 'report' : 'rate', isTripDriver: !passenger, isTripPassenger: passenger,
    trip, tripId: trip.id, passengers: passenger ? [] : people, selectedPassenger: multi || passenger ? null : people[0].id, rateTargetType: passenger ? 'driver' : 'passenger',
    rating: multi || empty ? 0 : 4, selectedTags: [], comment: '', reportReasons: [{ id: 'late', icon: 'time-outline', label: 'Retard important' }],
    reportReason: '', rateTags: [], isSubmittingReview: busy, setActiveTab: noop, setRating: noop, setComment: noop, goBackSafely: noop };
  const load = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
      style: { width: size, fontSize: size, color, textAlign: 'center', lineHeight: 1 } },
      ({ close: '×', star: '★', 'star-outline': '☆', 'checkmark-circle-outline': '✓', 'chevron-down': '⌄', 'ellipse-outline': '○' })[name] ?? '•') },
    'react-native-safe-area-context': { SafeAreaView: web.View },
    '@/utils/reanimated': { __esModule: true, default: { View: web.View } },
    '@/features/navigation/RideModal': { RideModal: ({ children }) => children },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: ({ children }) => children },
    '../../hooks/rating/useRatingData': { useRatingData: () => data },
    '../../hooks/rating/useRatingActions': { useRatingActions: () => ({ getRatingText: () => 'Très bien', toggleTag: noop, handleSubmitRating: noop }) },
    '../../hooks/rating/useRatingReport': { useRatingReport: () => ({ handleSubmitReport: noop }) },
    '@/hooks/driver-navigation/usePaidRequestCompletion': { usePaidRequestCompletion: () => ({ visible: true, busy,
      error: error ? 'La connexion est indisponible. Réessayez pour confirmer la fin du trajet.' : undefined, confirm: noop, dismiss: noop }) },
  });
  const Component = prompt ? load('features/driver-navigation/DriverPaidRequestCompletionPrompt.tsx').DriverPaidRequestCompletionPrompt
    : load('app/rate/[id].tsx').default;
  const markup = renderToStaticMarkup(h(Component, prompt ? { model: { session: { foundation: {
    data: { insets: { top: 24, bottom: 24 } }, refs: {}, mapState: {},
  }, completion: {} } }, blocked: false } : {}));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>${web.StyleSheet.getSheet().textContent}html,body{height:100%;margin:0;background:#e8eef0}
  #root{display:flex;flex-direction:column;width:${width}px;height:calc(100% - 48px);padding-top:24px}</style>
  <main id="root">${markup}</main><output id="layout-report" hidden></output><script>addEventListener('load',()=>{
    const frame=document.getElementById('root').getBoundingClientRect();
    const inside=el=>{const r=el.getBoundingClientRect();return r.height>0&&r.top>=frame.top&&r.bottom<=frame.bottom&&r.left>=frame.left&&r.right<=frame.right};
    const panel=document.querySelector('[data-testid="paid-request-completion-panel"]');
    const footer=document.querySelector('[data-testid="rating-submit-footer"]');
    const buttons=[...(panel||footer).querySelectorAll('[role="button"]')];
    const initial=buttons.every(inside);
    const reachable=buttons.every(el=>{el.scrollIntoView({block:'nearest'});return inside(el)});
    const workspace=document.querySelector('[data-testid="rating-content-scroll"]');
    const controlsReachable=!workspace||[...workspace.querySelectorAll('[role="radio"]')].every(el=>{
      el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),s=workspace.getBoundingClientRect();
      return r.top>=s.top&&r.bottom<=s.bottom&&r.left>=s.left&&r.right<=s.right;
    });
    document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0});
    document.getElementById('layout-report').textContent=JSON.stringify({horizontalOverflow:document.body.scrollWidth>innerWidth,
      actionsInitiallyVisible:initial,actionsReachable:reachable,controlsReachable,footerVisible:footer?inside(footer):true,
      panelTop:panel?Math.round(panel.getBoundingClientRect().top):null});
  });</script></html>`;
}

async function preview() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium executable.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-rating-preview-'));
  const session = await chromium(browser, directory);
  try { for (const item of [
    { name: 'completion', prompt: true, width: 390, height: 844 },
    { name: 'completion-busy', prompt: true, busy: true, width: 390, height: 844 },
    { name: 'completion-large-text', prompt: true, error: true, width: 320, height: 568, scale: 1.5 },
    { name: 'completion-landscape', prompt: true, width: 844, height: 390 },
    { name: 'rating', width: 390, height: 844 },
    { name: 'rating-initial', width: 390, height: 844, empty: true },
    { name: 'rating-driver', width: 390, height: 844, passenger: true },
    { name: 'rating-small', width: 320, height: 568 },
    { name: 'rating-large-text', width: 320, height: 568, scale: 1.5 },
    { name: 'rating-multiple', width: 390, height: 844, multi: true },
    { name: 'rating-report', width: 390, height: 844, report: true },
  ]) {
    const file = path.join(directory, `${item.name}.html`); fs.writeFileSync(file, renderFixture(item));
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let i = 0; i < 100 && !report; i++) {
      report = (await send('Runtime.evaluate', { expression: "document.getElementById('layout-report')?.textContent", returnByValue: true })).result?.value;
      if (!report) await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report) throw Error('Preview did not render.');
    const geometry = JSON.parse(report); console.log(item.name, geometry);
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${item.name}.png`), Buffer.from(capture.data, 'base64'));
    if (geometry.horizontalOverflow || !geometry.actionsReachable || !geometry.controlsReachable || !geometry.footerVisible) throw Error(`Clipped layout: ${item.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); console.log(`Synthetic RN Web previews (not native): ${directory}`); }
}
if (require.main === module) void preview().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
