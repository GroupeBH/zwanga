/* global __dirname */
// Read-only render of the real React Native screens using synthetic API fixtures.
// This does not validate Android/iOS, networking, uploads or actual payment providers.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const iconFont = pathToFileURL(require.resolve('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')).href;
const h = React.createElement;
function fixture(scenario) {
  const prices = { creditTotalMinor: '10000000', cashTotalMinor: '8000000', cashSavingMinor: '2000000', depositMinor: '1000000', plans: [{ id: 'monthly', period: 'month', count: 3 }, { id: 'weekly', period: 'week', count: 12 }] };
  const product = { id: 'test-product', name: 'Téléphone de démonstration', description: 'Fiche de test : modèle et accessoires détaillés par le vendeur. Aucun produit réel vendu par cet aperçu.', kind: 'phone', prices,
    details: { specifications: '128 Go · double SIM · batterie 5 000 mAh', warranty: 'Garantie de démonstration', requiredEvidence: ['identite'], vehicleTypes: [], processingDays: 3 },
    terms: 'Contrat synthétique pour contrôler la mise en page uniquement.', repayment: { netIncomeBps: 500, fixedPerTripMinor: '0', commissionShareBps: 0 } };
  const purchase = { ...prices, mode: 'credit', planId: 'monthly', installments: 3, period: 'month', totalMinor: '10000000', beforeDeliveryMinor: '1000000', installmentAmountsMinor: ['3000000', '3000000', '3000000'] };
  const contract = { id: 'test-contract', label: product.name, status: 'active', principalMinor: '9000000', paidMinor: '3000000', remainingMinor: '6000000', depositMinor: '1000000', depositPaidMinor: '1000000', deliveryState: 'delivered',
    installments: [{ ordinal: 2, dueAt: '2026-12-21', amountMinor: '3000000', remainingMinor: '3000000', overdueDays: 0 }], snapshot: { product, purchase, policy: { terms: product.terms, rules: product.repayment } } };
  let state = 0;
  const react = { ...React, useState(initial) {
    const index = state++;
    const current = React.useState(initial);
    if (scenario.screen === 'product' && index === 0) return ['credit', () => {}];
    if (scenario.screen === 'confirmation' && index === 4) return [{ label: 'Solder pour 54 000 FC au lieu de 60 000 FC. Remise : 6 000 FC.', identity: 'test', run: async () => {} }, () => {}];
    return current;
  } };
  const noop = () => ({ unwrap: async () => ({}) });
  const load = loader({
    react,
    'react-native': { ...web, useWindowDimensions: () => ({ width: scenario.width, height: scenario.height, scale: 1, fontScale: scenario.scale }), Text: ({ style, ...props }) => { const flat = web.StyleSheet.flatten(style) || {}; return h(web.Text, { ...props, style: [style, { ...(flat.fontSize ? { fontSize: flat.fontSize * scenario.scale } : {}), ...(flat.lineHeight ? { lineHeight: flat.lineHeight * scenario.scale } : {}) }] }); } },
    'react-native-safe-area-context': { SafeAreaView: ({ edges: _e, style, ...props }) => h(web.View, { ...props, style: [style, { paddingTop: 24, paddingBottom: 24 }] }) },
    'expo-router': { router: {}, Stack: { Screen: () => null } },
    '@expo/vector-icons': { Ionicons: ({ name, size = 24, color }) => h('span', { 'aria-hidden': true, style: { fontFamily: 'CatalogueIcons', fontSize: size, color, lineHeight: 1 } }, String.fromCodePoint(glyphs[name] ?? glyphs['ellipse-outline'])) },
    'expo-image-picker': {},
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/hooks/wallet/useWalletScreenScope': { useWalletScreenScope: () => () => () => true },
    '@/store/hooks': { useAppSelector: () => ({ id: 'synthetic-driver' }) },
    '@/store/selectors': { selectUser: () => ({ id: 'synthetic-driver' }) },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: () => ({}) },
    '@/store/api/proServicesApi': { useGetMyProCasesQuery: () => ({}) },
    '@/store/api/commerceApi': {
      useCommerceCategoriesQuery: () => ({ currentData: { items: [
        { id: 'phone', name: 'Téléphones', kind: 'phone' }, { id: 'equipment', name: 'Équipements conducteur et livreur', kind: 'equipment' },
        { id: 'accessories', name: 'Autres accessoires', kind: 'accessories' }, { id: 'document', name: 'Documents', kind: 'document' }, { id: 'vehicle', name: 'Véhicules', kind: 'vehicle' },
      ] } }),
      useCommerceProductsQuery: () => ({ currentData: { items: scenario.screen === 'catalogue' ? [product] : [] }, isError: scenario.screen === 'catalogue-error' }),
      useCommerceProductQuery: () => ({ currentData: product }), useCommerceQuoteQuery: () => ({ currentData: purchase }),
      useCommerceApplyMutation: () => [noop, {}], useCommerceUploadMutation: () => [noop, {}],
      useCommerceContractQuery: () => ({ currentData: contract }), useCommerceAcceptMutation: () => [noop], useCommercePayMutation: () => [noop],
      useCommerceSettleMutation: () => [noop], useCommerceChangePlanMutation: () => [noop], useLazyCommerceSettlementQuery: () => [noop], useLazyCommercePlansQuery: () => [noop, {}],
    },
  });
  const Screen = scenario.screen.startsWith('catalogue') ? load('app/services/catalogue.tsx').default : scenario.screen === 'product' ? load('features/pro-services/CommerceProductScreen.tsx').CommerceProductScreen : load('features/pro-services/CommerceContractScreen.tsx').CommerceContractScreen;
  const markup = renderToStaticMarkup(h(Screen, { id: 'synthetic' }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:CatalogueIcons;src:url('${iconFont}')} ${web.StyleSheet.getSheet().textContent}html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{display:flex;height:100%;flex-direction:column}</style><main id="root">${markup}</main></html>`;
}
async function main() {
  const executable = process.argv[2];
  if (!executable || !fs.existsSync(executable)) throw Error('Provide local Chromium path');
  const dir = path.resolve(__dirname, '../.expo/commerce-preview'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium(executable, fs.mkdtempSync(path.join(dir, 'session-'))), reports = [];
  try {
    const screens = process.argv.includes('--catalogue') ? ['catalogue', 'catalogue-empty', 'catalogue-error'] : ['product', 'contract', 'confirmation'];
    for (const screen of screens) for (const scale of [1, 2]) {
      const scenario = { screen, scale, width: screen.startsWith('catalogue') && scale === 1 ? 390 : 320, height: screen.startsWith('catalogue') && scale === 1 ? 844 : 568 }, name = `${screen}-${scale}`;
      const file = path.join(dir, `${name}.html`); fs.writeFileSync(file, fixture(scenario));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      let report;
      for (let i = 0; i < 100; i++) {
        const result = await send('Runtime.evaluate', { returnByValue: true,
          expression: `(()=>{const scrolls=[...document.querySelectorAll('div')].filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY));if(!scrolls.length)return null;const actions=[...document.querySelectorAll('[role="button"],[role="radio"],[role="checkbox"],input,textarea')];const inaccessible=actions.filter(e=>{e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top<0||r.bottom>innerHeight+1||r.left<0||r.right>innerWidth+1||r.height<44}).map(e=>e.textContent||e.getAttribute('aria-label'));scrolls.forEach(e=>e.scrollTop=0);return{horizontalOverflow:Math.max(document.documentElement.scrollWidth-innerWidth,...scrolls.map(e=>e.scrollWidth-e.clientWidth)),actions:actions.length,inaccessible}})()` });
        report = result.result?.value; if (report) break;
        await new Promise(r => setTimeout(r, 50));
      }
      if (!report || report.inaccessible.length || report.horizontalOverflow > 1) throw Error(`${name}: ${JSON.stringify(report)}`);
      reports.push({ ...scenario, ...report }); console.log(name, report);
      await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>true)', awaitPromise: true });
      await send('Runtime.evaluate', { expression: "document.querySelectorAll('div').forEach(e=>{e.scrollTop=0;e.scrollLeft=0});window.scrollTo(0,0)" });
      const viewport = await send('Runtime.evaluate', { returnByValue: true, expression: `({width:innerWidth,expected:${scenario.width},scrollX,scrollY})` });
      if (viewport.result?.value?.width !== scenario.width) throw Error(`Viewport expanded: ${JSON.stringify(viewport.result?.value)}`);
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(shot.data, 'base64'));
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(dir, 'measurements.json'), JSON.stringify(reports, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { fixture };
