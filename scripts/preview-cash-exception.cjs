/* global __dirname */
// Actual RN-Web views; synthetic disclosures only. No API/payment/device operation.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(width, height, scale, occurrence) {
  const load = loader({
    'react-native': { ...web, Text: props => {
      const style = web.StyleSheet.flatten(props.style) ?? {};
      return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * scale,
        ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }] });
    } },
    '@expo/vector-icons': { Ionicons: ({ size, color }) => h('span', { 'aria-hidden': true, style: { fontSize: size, color } }, '□') },
    './useCashExceptionDisclosure': { useCashExceptionDisclosure: () => ({ known: true, canConfirm: false, toggle: noop, refresh: noop,
      exception: { occurrence, penaltyAmount: occurrence === 1 ? 0 : 3000, requiresDriverAcknowledgment: true,
        message: occurrence === 1 ? 'Premier trajet en cash exceptionnel : avertissement, sans pénalité. Commission due. Prochain trajet non éligible : 3 000 FC.'
          : 'Cash non éligible : une pénalité de 3 000 FC pour tout le trajet, hors commission. Prélevée après la commission sur votre solde, puis ses prochains crédits pour le reste. Aucun supplément passager. Nouvelles courses bloquées, puis désactivation après la fin des courses en cours.' } }) },
    './useCashReceiptConfirmation': { useCashReceiptConfirmation: () => ({ busy: false, error: '', submit: async () => false }) },
  });
  const { CashPaymentRequestNotice } = load('features/driver-payments/CashPaymentRequestNotice.tsx');
  const html = renderToStaticMarkup(h(CashPaymentRequestNotice, { active: true, onClose: noop, onConfirmed: noop,
    notice: { bookingId: 'fixture', amount: 2000, currency: 'CDF', passengerName: 'Passager de démonstration' } }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  ${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif;background:#68746e}
  #root{display:flex;align-items:center;justify-content:center;height:${height}px;width:${width}px;max-width:100%;}</style><main id="root">${html}</main></html>`;
}
async function run() {
  const dir = path.resolve(__dirname, '../.expo/cash-exception-preview'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(dir, 'browser-')));
  try {
    for (const [width, height, scale, occurrence] of [[390,844,1,1],[390,844,1,4],[320,568,2,4]]) {
      const name = `${width}-${scale}-${occurrence}`, file = path.join(dir, `${name}.html`);
      fs.writeFileSync(file, fixture(width, height, scale, occurrence));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let i = 0; i < 50; i++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[role=checkbox]')", returnByValue: true })).result?.value) break;
        await new Promise(ok => setTimeout(ok, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const actions=[...document.querySelectorAll('[role=button],[role=checkbox]')];
        const reachable=actions.every(e=>{e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return r.height>=44 && r.top>=0 && r.bottom<=innerHeight+1 && r.right<=innerWidth+1});
        document.querySelectorAll('*').forEach(e=>{if(e.scrollTop)e.scrollTop=0});
        return {horizontalOverflow:document.documentElement.scrollWidth>innerWidth,reachable,actions:actions.length};
      })()` })).result.value;
      const capture = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(capture.data, 'base64'));
      console.log(JSON.stringify({ name, ...report }));
      if (!report.reachable || report.horizontalOverflow || report.actions !== 3) throw Error('Cash receipt layout failed');
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode=1; });
module.exports = { fixture };
