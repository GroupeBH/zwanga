/* global __dirname */
// Real publication UI, synthetic state, React Native Web. No API or native device.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { publishCompactFixture, hiddenPublishModals } = require('../tests/helpers/publishCompactFixture.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const noop = () => {}, h = React.createElement;
function renderFixture({ step, width, textScale = 1, recurring = false, recurrenceModal = false, longAddresses = false, unavailableCash = false, noVehicle = false, estimateState = 'ready' }) {
  const model = publishCompactFixture(step);
  model.form.isRecurringTrip = recurring;
  if (longAddresses) {
    model.presentation.departureSummary = { title: 'Avenue des Aviateurs, Gombe, Kinshasa', address: '' };
    model.presentation.arrivalSummary = { title: 'Kinshasa, République démocratique du Congo', address: '' };
  }
  if (estimateState === 'manual') model.form.price = '1800';
  if (estimateState === 'loading' || estimateState === 'unavailable') {
    model.form.price = ''; model.pricing.recommendation = null;
    model.pricing.loading = estimateState === 'loading';
  }
  if (noVehicle) { model.vehicle.activeVehicles = []; model.vehicle.selectedVehicleId = null; }
  const native = { ...web, Platform: { OS: 'android', select: values => values.android ?? values.default },
    StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
      Object.entries(styles).map(([key, value]) => [key, { ...value,
        ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
        ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
      }]))),
    },
  };
  const load = loader({
    'react-native': native, ...hiddenPublishModals,
    '../hooks/publish/usePublishController': { usePublishController: () => model },
    '@/components/LocationPickerModal': { __esModule: true, default: () => null },
    '@/components/VehicleFormModal': { VehicleFormModal: () => null },
    '@/components/forms/FormLayout': { FormScreen: ({ children, style }) => h(web.View, { style: [{ flex: 1, minHeight: 0 }, style] }, children),
      FormModal: ({ children }) => h(web.View, { style: { flex: 1, minHeight: 0 } }, children) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/utils/reanimated': { __esModule: true, default: { View: web.View }, FadeInDown: { duration: () => undefined } },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
      style: { fontSize: size, color, width: size, textAlign: 'center', flexShrink: 0 } },
    ({ close: '×', add: '+', remove: '−', 'chevron-down': '⌄', checkmark: '✓', ellipse: '●' })[name] ?? '◇') },
    'react-native-maps': { __esModule: true, default: web.View, Marker: web.View, Polyline: web.View },
    '@react-native-community/datetimepicker': {},
    'expo-router': { useRouter: () => ({ push: noop }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/store/hooks': { useAppSelector: () => ({ id: 'synthetic-driver' }) }, '@/store/selectors': {},
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => ({ currentData: unavailableCash ? undefined : {
      cash: { enabled: true, moneyPerToken: 10, availableTokens: 100, debtTokens: 0, debtLimitTokens: 25, availableCreditTokens: 25 },
    }, isFetching: false, isError: unavailableCash, refetch: noop }) },
  });
  const html = renderToStaticMarkup(recurrenceModal
    ? h(load('features/publish/PublishRecurrenceModal.tsx').PublishRecurrenceModal, {
      departureDateTime: model.form.departureDateTime, weekdays: model.form.recurringWeekdays, endDate: null,
      options: model.presentation.recurringWeekdayOptions, enabled: true, onSave: noop, onClose: noop,
    }) : h(load('app/publish.tsx').default));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    html,body{height:100%;margin:0;background:#eef2f6;font-family:Arial,sans-serif}#root{display:flex;flex-direction:column;width:${width}px;max-width:100%;height:calc(100% - 48px);padding-top:24px;margin:auto}
    </style><main id="root">${html}</main></html>`;
}
async function run() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium browser path.');
  const directory = path.resolve(__dirname, '../.expo/publish-compact-preview');
  fs.mkdirSync(directory, { recursive: true });
  const scenarios = ['route', 'pricing'].flatMap(step => [
    { step, width: 390, height: 844, name: `${step}-390` },
    { step, width: 360, height: 800, name: `${step}-360` },
    { step, width: 320, height: 568, name: `${step}-small` },
    { step, width: 320, height: 568, textScale: 1.35, name: `${step}-large-text` },
  ]).concat([
    { step: 'route', recurring: true, width: 360, height: 800, name: 'recurring' },
    { step: 'pricing', longAddresses: true, width: 390, height: 844, name: 'summary-long' },
    { step: 'pricing', longAddresses: true, textScale: 1.35, width: 320, height: 568, name: 'summary-long-large-text' },
    { recurrenceModal: true, width: 390, height: 844, name: 'recurrence-modal' },
    { recurrenceModal: true, width: 320, height: 568, name: 'recurrence-modal-small' },
    { recurrenceModal: true, textScale: 1.35, width: 320, height: 568, name: 'recurrence-modal-large-text' },
    { step: 'pricing', unavailableCash: true, width: 360, height: 800, name: 'cash-unavailable' },
    { step: 'pricing', noVehicle: true, width: 360, height: 800, name: 'first-vehicle' },
    ...['manual', 'loading', 'unavailable'].map(estimateState => ({ step: 'pricing', estimateState,
      width: 320, height: 568, name: `estimate-${estimateState}` })),
  ]);
  const session = await chromium(browser, fs.mkdtempSync(path.join(directory, 'session-'))), reports = [];
  try { for (const scenario of scenarios) {
    const file = path.join(directory, `${scenario.name}.html`);
    fs.writeFileSync(file, renderFixture(scenario));
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const scroll = document.querySelector('[data-testid="publish-step-content"],[data-testid="publish-recurrence-content"]');
        const footer = document.querySelector('[data-testid="publish-footer"],[data-testid="publish-recurrence-footer"]');
        if(!scroll || !footer) return null;
        const rect = el => el.getBoundingClientRect();
        const inside = el => { const r=rect(el); return r.height>0 && r.top>=24 && r.bottom<=innerHeight-24 && r.left>=0 && r.right<=innerWidth; };
        const footerVisible=inside(footer);
        const horizontalOverflow=Math.max(scroll.scrollWidth-scroll.clientWidth,document.documentElement.scrollWidth-innerWidth);
        const buttons=[...scroll.querySelectorAll('[role="button"],input,[role="switch"]')];
        const controlsReachable=buttons.every(el=>{el.scrollIntoView({block:'nearest',inline:'nearest'});return inside(el)});
        scroll.scrollTop=0;
        return {footerVisible,horizontalOverflow,controlsReachable,scrollRemaining:scroll.scrollHeight-scroll.clientHeight};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report) throw Error(`Missing layout: ${scenario.name}`);
    console.log(scenario.name, JSON.stringify(report)); reports.push({ ...scenario, ...report });
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
    if (!report.footerVisible || report.horizontalOverflow > 1 || !report.controlsReachable) throw Error(`Clipped controls: ${scenario.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
  console.log(`Local web previews only: ${directory}`);
}
if (require.main === module) void run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
