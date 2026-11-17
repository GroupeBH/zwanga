/* global __dirname */
// Synthetic RN Web layout check only, never a native map/GPS/voice test.
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./preview-arrival-payment.cjs');
require('./preview-active-navigation.cjs');

async function main() {
  const browserPath = process.argv[2];
  if (!browserPath || !fs.existsSync(browserPath)) throw Error('Provide local Chromium path');
  const dir = path.resolve(__dirname, '../.expo/active-navigation-preview');
  const browser = await chromium(browserPath, fs.mkdtempSync(path.join(dir, 'session-')));
  const reports = [];
  try {
    for (const width of [320, 390]) for (const mode of ['pickup', 'dropoff', 'cruising', 'pending', 'offline', 'empty']) {
      const name = `driver-${mode}-${width}`;
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height: width === 320 ? 568 : 760, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(path.join(dir, 'index.html')).href + '?case=' + name });
      let report;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(()=>{
          if(document.readyState!=='complete'||document.querySelectorAll('[data-case]').length!==1||document.querySelector('[data-case]')?.dataset.case!==${JSON.stringify(name)})return null;
          const panel=document.querySelector('[data-testid="driver-navigation-top-panel"]');if(!panel)return null;
          document.querySelector('h2')?.remove();document.querySelector('main').style.padding='0';
          const box=panel.getBoundingClientRect();const controls=document.querySelector('[aria-label="Options de navigation"]');
          const sos=panel.querySelector('[aria-label^="SOS"]')?.getBoundingClientRect();
          const assistanceInitiallyVisible=!!sos&&sos.top>=box.top&&sos.bottom<=box.bottom;
          const overflow=Math.max(0,document.documentElement.scrollWidth-innerWidth);
          const actions=[...panel.querySelectorAll('[role="button"]')];
          const reachable=actions.every(e=>{e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return r.height>=44&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
          panel.querySelectorAll('div').forEach(e=>{e.scrollTop=0});
          return {width:innerWidth,height:box.height,overlap:box.bottom>controls.getBoundingClientRect().top,horizontalOverflow:overflow,reachable,assistanceInitiallyVisible,actions:actions.length,
            confirms:panel.textContent.includes('Confirmer l’arrivée'),passengerSummary:!!panel.querySelector('[aria-label^="Arrivée :"]')};})()` });
        report = result.result?.value;
        if (report) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!report || report.width !== width || report.overlap || report.horizontalOverflow > 1 || !report.reachable || !report.assistanceInitiallyVisible || (mode === 'cruising' && report.confirms)) throw Error(`${name}: ${JSON.stringify(report)}`);
      reports.push({ name, ...report }); console.log(name, report);
      const png = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(png.data, 'base64'));
      await browser.send('Target.closeTarget', { targetId });
    }
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(reports, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
