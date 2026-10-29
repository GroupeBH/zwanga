/* Local visual fixture: real coordinator/recovery components, synthetic data,
 * React Native Web instead of native Yoga. Never connects to an API or pays. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const noop = () => {};

function renderFixture({ pending = true, busy = false, textScale = 1, card = false, width = 390, tokenCash = false } = {}) {
  const state = {
    user: { id: 'preview-only' }, arrivalBooking: { id: 'preview-booking', passengerDestination: 'Destination de démonstration' },
    isAppActive: true, isResumeReady: true, insets: { bottom: 0 }, isBeforeArrival: false,
    hasPendingProviderPayment: pending, canChangeFailedPaymentMode: !pending, isBusy: busy, isMutatingPayment: busy,
    selectedMode: 'electronic', paymentAmount: 4500, paymentCurrency: 'CDF', hasCardPaymentToResume: card,
    deferPayment: noop, setSelectedMode: noop,
  };
  const native = { ...web, Platform: { OS: 'android', select: o => o.android ?? o.default },
    StyleSheet: { ...web.StyleSheet, create: styles => web.StyleSheet.create(Object.fromEntries(
      Object.entries(styles).map(([key, value]) => [key, { ...value,
        ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}),
        ...(value.lineHeight ? { lineHeight: value.lineHeight * textScale } : {}),
      }]))),
    },
  };
  const { PassengerArrivalPaymentCoordinator } = loader({
    'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => React.createElement('span', {
      'aria-hidden': true, style: { fontSize: size, color, width: size, textAlign: 'center' },
    }, name === 'close' ? '×' : name === 'time-outline' ? '◷' : '!') },
    'expo-linking': { createURL: () => 'zwanga://preview' },
    'expo-web-browser': { maybeCompleteAuthSession: noop },
    '@/components/forms/FormLayout': { FormModal: ({ visible, children }) => visible ? React.createElement(web.View, { style: { flex: 1 } }, children) : null },
    '@/store/hooks': { useAppSelector: fn => fn() },
    '@/store/selectors': { selectUser: () => state.user, selectIsAuthenticated: () => true },
    '../hooks/arrival-payment/useArrivalPaymentState': { useArrivalPaymentState: () => state },
    '../hooks/arrival-payment/useMixedCashPayment': { useMixedCashPayment: () => ({ pending: false }) },
    '../hooks/arrival-payment/useArrivalPaymentCompletion': { useArrivalPaymentCompletion: () => ({}) },
    '../hooks/arrival-payment/useArrivalPaymentProvider': { useArrivalPaymentProvider: () => ({}) },
    '../hooks/arrival-payment/useArrivalPaymentMonitoring': { useArrivalPaymentMonitoring: () => ({ verification: { phase: 'waiting' }, retryVerification: noop }) },
    '../hooks/arrival-payment/useArrivalPaymentRecovery': { useArrivalPaymentRecovery: () => ({}) },
    '../hooks/arrival-payment/useTokenCashFallback': { useTokenCashFallback: () => ({ canSwitch: tokenCash, run: noop }) },
    '../hooks/arrival-payment/useArrivalPaymentSubmission': { useArrivalPaymentSubmission: () => ({ payCash: noop }) },
    '../hooks/arrival-payment/useArrivalPaymentNavigation': { useArrivalPaymentNavigation: () => ({ handleResumeCardPayment: noop }) },
    '../features/arrival-payment/ArrivalPaymentFields': { ArrivalPaymentFields: () => null },
    '../features/arrival-payment/ArrivalPaymentActions': { ArrivalPaymentActions: () => null },
    '@/components/trip/PassengerInterruptionChoice': { PassengerInterruptionChoice: () => null },
    '@/features/arrival-payment/PendingPaymentReminder': { PendingPaymentReminder: () => null },
    '@/store/slices/tripsSlice': { openInterruptionChoice: noop },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => ({ currentData: {
      acceptedPaymentModes: ['cash'], availablePaymentModes: ['cash'],
    } }) },
  })('components/PassengerArrivalPaymentCoordinator.tsx');
  const html = renderToStaticMarkup(React.createElement(PassengerArrivalPaymentCoordinator));
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    html,body{margin:0;height:100%;background:#f5f4f0}#root{display:flex;width:${width}px;max-width:100%;margin:auto;height:calc(100% - 48px);padding-top:24px;flex-direction:column}
    </style></head><body><main id="root">${html}</main><output id="layout-report" hidden></output>
    <script>addEventListener('load',()=>{
      const close=document.querySelector('[aria-label="Fermer le paiement pour le moment"]');
      const header=close.parentElement, sheet=header.parentElement.parentElement;
      const frame=document.getElementById('root').getBoundingClientRect();
      const inside=el=>{const r=el.getBoundingClientRect();return r.height>0&&r.top>=frame.top&&r.bottom<=frame.bottom&&r.left>=frame.left&&r.right<=frame.right};
      const buttons=[...document.querySelectorAll('[role="button"]')];
      const initial=buttons.every(inside);
      const reachable=buttons.every(button=>{button.scrollIntoView({block:'nearest'});return inside(button)});
      document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0});
      document.getElementById('layout-report').textContent=JSON.stringify({viewportWidth:innerWidth,viewportHeight:innerHeight,contentWidth:frame.width,height:sheet.getBoundingClientRect().height,
        closeVisible:inside(close),headerVisible:inside(header),allActionsInitiallyVisible:initial,allActionsReachable:reachable});
    });</script></body></html>`;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function chromium(browser, directory) {
  const profile = path.join(directory, 'browser-profile');
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let launchError;
  child.on('error', error => { launchError = error; });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 20000;
    while (!fs.existsSync(portFile)) {
      if (launchError || child.exitCode !== null || Date.now() > deadline) throw Error('Local browser could not start.');
      await delay(100);
    }
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Local browser connection timed out')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Local browser connection failed')); }, { once: true });
    });
    let id = 0;
    const waiting = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data), request = waiting.get(message.id);
      if (!request) return;
      waiting.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(Error(message.error.message)); else request.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { waiting.delete(requestId); reject(Error(`Browser timed out: ${method}`)); }, 10000);
      waiting.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
    });
    return { send, close: async () => {
      await send('Browser.close').catch(() => {});
      for (const request of waiting.values()) clearTimeout(request.timer);
      socket.close(); child.kill();
    } };
  } catch (error) { socket?.close(); child.kill(); throw error; }
}

async function runPreview() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply the path to a local Chromium/Edge executable.');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-payment-preview-'));
  const scenarios = [
    { name: 'pending', width: 390, height: 844 },
    { name: 'checking', width: 390, height: 844, busy: true },
    { name: 'cash', width: 390, height: 844, pending: false },
    { name: 'token-cash', width: 390, height: 844, tokenCash: true },
    { name: 'token-cash-small', width: 320, height: 568, textScale: 1.5, tokenCash: true },
    { name: 'small-large-text', width: 320, height: 568, textScale: 1.5, card: true },
    { name: 'landscape', width: 844, height: 390, card: true },
  ];
  const browserSession = await chromium(browser, directory);
  try { for (const scenario of scenarios) {
    const file = path.join(directory, `${scenario.name}.html`);
    fs.writeFileSync(file, renderFixture(scenario));
    const { targetId } = await browserSession.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browserSession.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browserSession.send(method, params, sessionId);
    // Device emulation, not window-size: Windows can clamp the headless window
    // width and capture a different viewport from the one used by dump-dom.
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    const deadline = Date.now() + 10000;
    while (!report && Date.now() < deadline) {
      const evaluation = await send('Runtime.evaluate', { expression: "document.getElementById('layout-report')?.textContent", returnByValue: true });
      report = evaluation.result?.value;
      if (!report) await delay(50);
    }
    if (!report) throw Error(`Preview failed: ${scenario.name}`);
    const geometry = JSON.parse(report);
    console.log(scenario.name, geometry);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
    if (!geometry.closeVisible || !geometry.headerVisible || !geometry.allActionsReachable ||
      geometry.viewportWidth !== scenario.width || geometry.viewportHeight !== scenario.height ||
      (scenario.height === 844 && !geometry.allActionsInitiallyVisible)) throw Error(`Clipped controls: ${scenario.name}`);
    await browserSession.send('Target.closeTarget', { targetId });
  } } finally { await browserSession.close(); }
  console.log(`Synthetic previews only (not native validation): ${directory}`);
}
if (require.main === module) void runPreview().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture, chromium };
