/* global __dirname */
// Real RN-Web marker symbols over a synthetic diagram, not a native map benchmark.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement;
const { RoutePointSymbol } = loader({ 'react-native': { ...web, Platform: { OS: 'android' } },
  'react-native-maps': { Marker: 'div' },
})('components/maps/RoutePointMarker.tsx');

function fixture(width, scale) {
  const symbol = (kind, highlighted = false) => renderToStaticMarkup(h(RoutePointSymbol, { kind, highlighted }));
  const departure = symbol('departure'), arrival = symbol('arrival'), active = symbol('arrival', true), passenger = symbol('passenger');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    *{box-sizing:border-box}html,body{margin:0;font:14px Arial,sans-serif;color:#1e294a;background:#fff}
    main{width:${width}px;max-width:100%}header{padding:20px;font-size:${20 * scale}px;font-weight:bold}
    .map{height:330px;position:relative;background:#e7ede5;overflow:hidden}.map>svg{width:100%;height:100%;position:absolute}
    .point{position:absolute;transform:translate(-50%,-50%)}.start{left:25%;top:76%}.end{left:76%;top:22%}
    .legend{padding:16px}.row{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:${14 * scale}px}
    footer{font-size:12px;color:#5b6678;padding:16px;line-height:1.5;border-top:1px solid #eef0f4}
    </style><main><header>Votre itinéraire</header><div class="map">
    <svg viewBox="0 0 390 330" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 0H390V36Q280 70 230 40Q160 20 0 68Z" fill="#bfe4ed"/>
      <path d="M-10 110L410 65M-10 235L410 190M60 50L130 345M240 25L315 350" fill="none" stroke="white" stroke-width="9"/>
      <path d="M98 251L174 233L166 199L259 187L247 133L296 73" fill="none" stroke="#f76a2d" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg><div class="point start" data-symbol="departure">${departure}</div><div class="point end" data-symbol="arrival">${arrival}</div>
    </div><section class="legend"><div class="row">${departure}Départ</div><div class="row">${arrival}Destination</div>
    <div class="row">${active}Prochain arrêt</div><div class="row">${passenger}Destination d’un passager</div></section>
    <footer>Aperçu isolé des composants · fond cartographique illustratif. Ne mesure pas le rendu ou la fluidité de Google Maps sur téléphone.</footer></main></html>`;
}
async function run() {
  const dir = path.resolve(__dirname, '../.expo/map-markers-preview'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(dir, 'browser-')));
  try {
    for (const [width, height, scale] of [[390, 844, 1], [320, 740, 1.5]]) {
      const name = `${width}-${scale}`, file = path.join(dir, name + '.html'); fs.writeFileSync(file, fixture(width, scale));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let n = 0; n < 50; n++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[data-symbol]')", returnByValue: true })).result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const sizes=[...document.querySelectorAll('[data-symbol]')].map(el=>{
          const r=el.firstElementChild.getBoundingClientRect(), s=el.firstElementChild.firstElementChild.getBoundingClientRect();
          return {frame:[r.width,r.height],symbol:[s.width,s.height]};
        }); return {sizes,overflow:document.documentElement.scrollWidth>innerWidth};
      })()` })).result.value;
      if (report.overflow || report.sizes.some(s => s.symbol[0] !== 24 || s.symbol[1] !== 24 || s.frame[0] !== 44)) throw Error('Unexpected marker layout');
      const capture = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(capture.data, 'base64'));
      console.log(JSON.stringify({ name, ...report })); await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { fixture };
