/* Synthetic local preview of the actual JSX/styles via RN Web; no API or native alert. */
/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const noop = () => {};
const h = React.createElement;

function renderFixture({ width = 390, textScale = 1, choose = false } = {}) {
  const car = { id: 'car', brand: 'Toyota', model: 'Corolla', licensePlate: 'TEST-01' };
  const decision = { visible: true, available: true, canAccept: !choose, isIdentityVerified: true,
    loading: false, busy: false, vehicles: choose ? [car, { ...car, id: 'second', model: 'Yaris' }] : [car],
    vehicle: choose ? null : car,
    order: { id: 'preview', passengerName: 'Passager de démonstration', maxPricePerSeat: 5000, numberOfSeats: 1,
      departureDateMin: '2026-11-11T09:00:00Z', departureDateMax: '2026-11-11T09:15:00Z',
      departure: { name: 'Gombe', reference: 'Devant la pharmacie, avenue des Aviateurs' },
      arrival: { name: 'Gare Centrale', reference: 'Entrée principale' } },
    close: noop, onDismiss: noop, accept: noop, openDetails: noop, selectVehicle: noop, retry: noop };
  const native = { ...web, StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
    Object.entries(styles).map(([key, value]) => [key, { ...value,
      ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
      ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
    }])) ) } };
  const { HomeRequestModal } = loader({
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    '@/features/navigation/RideModal': { RideModal: ({ children }) => h(web.View, { style: { flex: 1 } }, children) },
    '@/features/navigation/RideOverlayProvider': { useRideOverlayStore: () => ({}) },
    '@/hooks/home/useHomeRequestDecision': { useHomeRequestDecision: () => decision },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
      style: { fontSize: size, color, width: size, textAlign: 'center', flexShrink: 0 } },
    ({ 'car-outline': '▱', 'radio-button-on': '●', 'location': '◆', 'person-circle-outline': '♙' })[name] ?? '○') },
  })('components/home/HomeRequestModal.tsx');
  const html = renderToStaticMarkup(h(HomeRequestModal, { enabled: true }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent} html,body{height:100%;margin:0;font-family:Arial,sans-serif}
    #root{display:flex;flex-direction:column;width:${width}px;max-width:100%;height:100%;margin:auto}</style>
    <main id="root">${html}</main></html>`;
}

async function run() {
  const browser = process.argv[2]; if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium path.');
  const directory = path.resolve(__dirname, '../.expo/request-modal-preview'); fs.mkdirSync(directory, { recursive: true });
  const session = await chromium(browser, fs.mkdtempSync(path.join(directory, 'session-'))), reports = [];
  try { for (const scenario of [{ width: 390, height: 844, name: 'standard' },
    { width: 320, height: 568, name: 'small' },
    { width: 320, height: 568, textScale: 1.35, name: 'large-text' },
    { width: 320, height: 568, textScale: 1.35, choose: true, name: 'vehicle-choice' }]) {
    const file = path.join(directory, `${scenario.name}.html`); fs.writeFileSync(file, renderFixture(scenario));
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const panel=document.querySelector('[data-testid="home-request-modal"]'); if(!panel) return null;
        const p=panel.getBoundingClientRect();
        const decisions=Array.from(panel.querySelectorAll('[role="button"]')).filter(node=>['Ignorer','Accepter','Voir les détails'].includes(node.textContent));
        const boxes=decisions.map(node=>node.getBoundingClientRect());
        return {panelFits:p.top>=23&&p.bottom<=innerHeight-23,
          actionsVisible:boxes.length===3&&boxes.every(b=>b.height>=44&&b.top>=24&&b.bottom<=innerHeight-24&&b.left>=0&&b.right<=innerWidth),
          horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report) throw Error(`Missing layout ${scenario.name}`);
    console.log(scenario.name, JSON.stringify(report)); reports.push({ ...scenario, ...report });
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
    if (!report.panelFits || !report.actionsVisible || report.horizontalOverflow > 1) throw Error(`Clipped ${scenario.name}`);
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
}
if (require.main === module) void run().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { renderFixture };
