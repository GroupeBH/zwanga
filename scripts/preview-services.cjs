/* global __dirname */
// Actual service components rendered in RN Web, synthetic data only. No API/native runtime.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement;
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const font = fs.readFileSync(path.resolve(__dirname, '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')).toString('base64');

function renderFixture({ textScale = 1, fleetOpen = false, error = false, embedded = true } = {}) {
  const native = { ...web, Text: ({ style, ...props }) => {
    const flat = web.StyleSheet.flatten(style) || {};
    return h(web.Text, { ...props, style: [style, {
      ...(flat.fontSize ? { fontSize: flat.fontSize * textScale } : {}),
      ...(flat.lineHeight ? { lineHeight: flat.lineHeight * textScale } : {}),
    }] });
  } };
  const { default: ServicesScreen } = loader({
    'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: ({ edges: _edges, style, ...props }) => h(web.View, { ...props, style: [style, { paddingTop: 24, paddingBottom: embedded ? 0 : 24 }] }) },
    'expo-router': { router: {}, Stack: { Screen: () => null } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/proServicesApi': {
      useGetProOfferingsQuery: () => ({ isError: error, error: { data: { message: 'Connexion indisponible. Réessayez.' } },
        currentData: error ? undefined : ['documents', 'fleet', 'vehicles', 'equipment'].map(code => ({ code, availability: code === 'documents' || (code === 'fleet' && fleetOpen) ? 'open' : 'coming_soon' })), refetch() {} }),
      useGetMyProCasesQuery: () => ({ currentData: { items: [] }, refetch() {} }),
      useGetCurrentDocumentCaseQuery: () => ({ currentData: { request: null } }),
    },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true,
      style: { fontFamily: 'Ionicons', fontSize: size, color, flexShrink: 0 } }, String.fromCodePoint(glyphs[name])) },
  })('features/pro-services/ServicesScreen.tsx');
  const markup = renderToStaticMarkup(h(ServicesScreen, { embedded, bottomOverlay: embedded ? 72 : 0 }));
  const tabs = embedded ? '<footer>Accueil &nbsp; · &nbsp; <strong>Services</strong> &nbsp; · &nbsp; Mes trajets &nbsp; · &nbsp; Profil</footer>' : '';
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    @font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${font})}
    html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{display:flex;flex-direction:column;height:100%}
    footer{position:absolute;bottom:0;left:0;right:0;height:72px;display:flex;align-items:center;justify-content:center;background:#fff;border-top:1px solid #e7ebee;font-size:12px;color:#647582}strong{color:#C34412;margin:0 6px}
    </style><main id="root">${markup}</main>${tabs}</html>`;
}

async function run() {
  const browser = process.argv[2];
  if (!browser || !fs.existsSync(browser)) throw Error('Supply a local Chromium executable path.');
  const directory = path.resolve(__dirname, '../.expo/services-preview');
  fs.mkdirSync(directory, { recursive: true });
  const session = await chromium(browser, fs.mkdtempSync(path.join(directory, 'session-')));
  const reports = [];
  const scenarios = [
    { name: 'standard', width: 390, height: 844 },
    { name: 'fleet-open', width: 390, height: 844, fleetOpen: true },
    { name: 'small', width: 320, height: 568 },
    { name: 'large-text', width: 320, height: 568, textScale: 1.6 },
    { name: 'offline', width: 390, height: 844, error: true },
    { name: 'standalone', width: 390, height: 844, embedded: false },
  ];
  try {
    for (const scenario of scenarios) {
      const file = path.join(directory, `${scenario.name}.html`);
      fs.writeFileSync(file, renderFixture(scenario));
      const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => session.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      let report;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
          const directory = document.querySelector('[data-testid="pro-business-services"]'); if(!directory) return null;
          await document.fonts.ready;
          const scroll = [...document.querySelectorAll('div')].find(el => ['auto','scroll'].includes(getComputedStyle(el).overflowY));
          const frame = scroll.getBoundingClientRect();
          const bottom = Math.min(frame.bottom, document.querySelector('footer')?.getBoundingClientRect().top ?? innerHeight);
          const inside = el => {const b=el.getBoundingClientRect();return b.top>=frame.top-1&&b.bottom<=bottom+1&&b.left>=0&&b.right<=innerWidth+1};
          const services = [...document.querySelectorAll('[data-testid^="pro-service-"]')];
          const initiallyVisible = services.filter(inside).length;
          const actions = [...document.querySelectorAll('[role="button"]')];
          const actionsReachable = actions.every(el => {
            if(scroll.contains(el)) {el.scrollIntoView({block:'center'});return inside(el)&&el.getBoundingClientRect().height>=44}
            const box=el.getBoundingClientRect();
            return box.height>=44&&box.top>=24&&box.bottom<=bottom&&box.left>=0&&box.right<=innerWidth;
          });
          const overflow = Math.max(document.documentElement.scrollWidth-innerWidth, scroll.scrollWidth-scroll.clientWidth,
            ...services.map(el=>el.scrollWidth-el.clientWidth));
          const noPreviewButtons = ['delivery','schools','health'].every(code=>{
            const row=document.querySelector('[data-testid="pro-service-'+code+'"]');
            return row.getAttribute('role')!=='button'&&!row.querySelector('[role="button"]');
          });
          scroll.scrollTop=0;
          return {serviceCount:services.length, initiallyVisible, actionsReachable, horizontalOverflow:overflow, noPreviewButtons};
        })()` });
        if (result.result?.value) { report = result.result.value; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!report) throw Error(`No layout: ${scenario.name}`);
      console.log(scenario.name, JSON.stringify(report));
      reports.push({ ...scenario, ...report });
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
      if (report.serviceCount !== 6 || !report.actionsReachable || !report.noPreviewButtons || report.horizontalOverflow > 1) throw Error(`Clipped controls: ${scenario.name}`);
      await session.send('Target.closeTarget', { targetId });
    }
  } finally { await session.close(); }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
}
if (require.main === module) void run().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { renderFixture };
