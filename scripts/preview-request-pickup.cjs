/* global __dirname */
// Real beacon component at sampled phases; synthetic background, no native map or live animation.
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
const sampledValue = value => ({ value, interpolate: ({ inputRange, outputRange }) => {
  const upper = inputRange.findIndex((end, index) => index > 0 && value <= end);
  const index = upper < 0 ? inputRange.length - 1 : upper;
  const fraction = (value - inputRange[index - 1]) / (inputRange[index] - inputRange[index - 1]);
  return outputRange[index - 1] + fraction * (outputRange[index] - outputRange[index - 1]);
} });

function renderFixture(phase) {
  const { RequestPickupBeacon } = loader({
    'react-native': { ...web, Animated: { View: web.View,
      add: (value, offset) => sampledValue(value.value + offset), modulo: (value, modulus) => sampledValue(value.value % modulus),
    } },
    '@expo/vector-icons': { Ionicons: () => h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true },
      h('circle', { cx: 8, cy: 4.5, r: 3, fill: '#fff' }), h('path', { d: 'M2 15v-2a6 5 0 0 1 12 0v2z', fill: '#fff' })) },
    '@/hooks/request-detail/useRequestPickupRipple': { useRequestPickupRipple: () => sampledValue(phase) },
  })('features/request-detail/RequestPickupBeacon.tsx');
  const body = renderToStaticMarkup(h(web.View, { style: { height: 400, backgroundColor: '#E9EFED', overflow: 'hidden' } },
    h(RequestPickupBeacon, { point: { x: 160, y: 200 }, enabled: true })));
  return '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + web.StyleSheet.getSheet().textContent +
    'body{margin:0;font-family:Arial;background:white}main{width:320px;margin:auto}p{font-size:12px;padding:12px;color:#657080}</style>' +
    '<main>' + body + '<p>Repère réel · fond de carte simulé · phase ' + phase + '</p></main></html>';
}
async function run() {
  const directory = path.resolve(__dirname, '../.expo/request-pickup-preview'); fs.mkdirSync(directory, { recursive: true });
  const phases = [0, 0.25, 0.5, 0.75];
  for (const phase of phases) fs.writeFileSync(path.join(directory, `${phase}.html`), renderFixture(phase));
  const session = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'session-')));
  try { for (const phase of phases) {
    const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => session.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 480, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: pathToFileURL(path.join(directory, `${phase}.html`)).href });
    const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const anchor=document.querySelector('[data-testid="request-pickup-beacon"]'); if(!anchor) return null;
      const r=anchor.getBoundingClientRect();
      const waves=[...document.querySelectorAll('[data-testid^="request-pickup-wave-"]')].map(w=>{
        const p=w.getBoundingClientRect(); return {width:p.width,x:p.x+p.width/2,y:p.y+p.height/2,opacity:Number(getComputedStyle(w).opacity)};
      }); return {x:r.x,y:r.y,waves};
    })()` });
    const report = result.result.value;
    console.log(phase, JSON.stringify(report));
    if (!report || report.x !== 160 || report.y !== 200 || report.waves.length !== 2 ||
      report.waves.some(wave => Math.abs(wave.x - 160) > 0.1 || Math.abs(wave.y - 200) > 0.1)) process.exitCode = 1;
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(directory, `${phase}.png`), Buffer.from(shot.data, 'base64'));
    await session.send('Target.closeTarget', { targetId });
  } } finally { await session.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { renderFixture };
