/* global __dirname */
// Actual header with synthetic data; web layout checks, not native device validation.
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

function renderHeader({ textScale = 1, driver = true, os = 'android' }) {
  const native = { ...web, Platform: { OS: os }, StyleSheet: { ...web.StyleSheet,
    create: values => web.StyleSheet.create(Object.fromEntries(Object.entries(values).map(([key, value]) =>
      [key, { ...value, ...(value.fontSize ? { fontSize: value.fontSize * textScale } : {}) }]))),
  } };
  const { ProfileHeader } = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', {
      'aria-hidden': true, style: { width: size, fontSize: size, color, textAlign: 'center', flexShrink: 0 },
    }, ({ 'qr-code-outline': '▦', 'settings-outline': '⚙', 'car-outline': '▱', camera: '▣' })[name] ?? '•') },
  })('components/profile/ProfileHeader.tsx');
  const html = renderToStaticMarkup(h(ProfileHeader, {
    currentUser: { name: 'Compte de démonstration', driverCategory: driver ? 'transport' : undefined },
    displaysDriverRole: driver, profileRoleLabel: driver ? 'Conducteur' : 'Passager',
    router: { push() {} }, changeProfilePhoto() {},
  }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}html,body{margin:0;background:white;font-family:Arial,sans-serif}
    main{padding-top:24px}</style><main>${html}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/profile-header-preview');
  fs.mkdirSync(directory, { recursive: true });
  const scenarios = [
    { name: 'driver-standard', width: 390, height: 844 },
    { name: 'driver-small', width: 320, height: 568 },
    { name: 'driver-large-text', width: 320, height: 568, textScale: 1.5 },
    { name: 'driver-largest-text', width: 320, height: 568, textScale: 2 },
    { name: 'driver-ios', width: 390, height: 844, os: 'ios' },
    { name: 'passenger-small', width: 320, height: 568, driver: false },
  ];
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'session-')));
  const reports = [];
  try { for (const scenario of scenarios) {
    const file = path.join(directory, `${scenario.name}.html`);
    fs.writeFileSync(file, renderHeader(scenario));
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (method, params) => browser.send(method, params, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: true });
    await send('Network.enable');
    await send('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
    await send('Page.navigate', { url: pathToFileURL(file).href });
    let report;
    for (let attempt = 0; attempt < 60; attempt++) {
      const result = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const settings=document.querySelector('[aria-label="Ouvrir les paramètres"]');
        if(!settings) return null;
        const qr=document.querySelector('[aria-label="Mon QR conducteur"]');
        const title=document.querySelector('[data-testid="profile-header-title"]');
        const range=document.createRange();range.selectNodeContents(title);
        const titleBounds=range.getBoundingClientRect();
        const overlapsTitle=el=>{const r=el.getBoundingClientRect();return (
          titleBounds.left<r.right&&titleBounds.right>r.left&&titleBounds.top<r.bottom&&titleBounds.bottom>r.top)};
        const visible=el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44&&
          r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth+1};
        return {overflow:document.documentElement.scrollWidth-innerWidth,qrPresent:!!qr,
          controlsVisible:visible(settings)&&(!qr||visible(qr)),
          titleVisible:titleBounds.left>=0&&titleBounds.right<=innerWidth+1,
          noOverlap:!overlapsTitle(settings)&&(!qr||(!overlapsTitle(qr)&&
            qr.getBoundingClientRect().right<=settings.getBoundingClientRect().left))};
      })()` });
      if (result.result.value) { report = result.result.value; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!report || report.overflow > 1 || !report.controlsVisible || !report.titleVisible || !report.noOverlap ||
      report.qrPresent !== (scenario.driver !== false)) throw Error(`${scenario.name}: ${JSON.stringify(report)}`);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(directory, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
    reports.push({ ...scenario, ...report });
    console.log(scenario.name, report);
    await browser.send('Target.closeTarget', { targetId });
  } } finally { await browser.close(); }
  fs.writeFileSync(path.join(directory, 'measurements.json'), JSON.stringify(reports, null, 2));
}
if (require.main === module) void run().catch(error => { console.error(error.message); process.exitCode = 1; });
