/* global __dirname */
// Actual section, synthetic identities, RN-Web only. No account, API or native map.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement;

function fixture(mode, scale) {
  const people = [{ id: 'one', userId: 'member-one', firstName: 'Alex', seats: 1, avatarUrl: null },
    { id: 'two', userId: 'member-two', firstName: scale > 1 ? 'Prénom composé particulièrement long' : 'Camille', seats: 2, avatarUrl: null }];
  const native = { ...web, Text: props => {
    const style = web.StyleSheet.flatten(props.style) ?? {};
    return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * scale,
      ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }] });
  } };
  const load = loader({ react: { ...React, useState: () => [mode !== 'collapsed', () => {}] }, 'react-native': native,
    '@/hooks/trip-detail/useCoPassengerActions': { useCoPassengerActions: () => ({ profile() {}, message() {}, busy: false }) },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', {
      style: { fontSize: size, color, width: size, flexShrink: 0, textAlign: 'center' }, 'aria-hidden': true,
    }, ({ 'people-outline': '♧', 'chevron-down': '⌄', 'chevron-up': '⌃', 'refresh-outline': '↻' })[name] || '○') },
    '@/hooks/trip-detail/useTripCoPassengers': { useTripCoPassengers: () => ({
      eligible: true, online: mode !== 'offline', denied: mode === 'denied', loading: mode === 'loading',
      participants: mode === 'empty' ? [] : people, refresh: () => {},
    }) },
  });
  const { TripCoPassengers } = load('features/trip-detail/TripCoPassengers.tsx');
  const markup = renderToStaticMarkup(h(web.View, { style: { paddingVertical: 16 } },
    h(native.Text, { style: { margin: 16, color: '#1E294A', fontWeight: '700', fontSize: 20 } }, 'Votre réservation'),
    h(TripCoPassengers, { active: true })));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}html,body{margin:0;font-family:Arial,sans-serif;background:white}</style><main>${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/co-passengers-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try {
    for (const [mode, width, height, scale] of [['collapsed', 390, 844, 1], ['expanded', 390, 844, 1],
      ['expanded', 320, 568, 2], ['empty', 320, 568, 1], ['offline', 320, 568, 2], ['denied', 320, 568, 2]]) {
      const name = `${mode}-${width}-${scale}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture(mode, scale));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let n = 0; n < 50; n++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[role=button]')", returnByValue: true })).result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const texts = [...document.querySelectorAll('[dir=auto]')];
        const clipped = texts.some(el => { const r=el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth+1; });
        const buttons = [...document.querySelectorAll('[role=button]')];
        const reachable = buttons.every(el => { el.scrollIntoView({block:'nearest'}); const r=el.getBoundingClientRect(); return r.height>=44 && r.bottom<=innerHeight+1; });
        window.scrollTo(0,0); return {clipped, reachable, horizontalOverflow: document.documentElement.scrollWidth > innerWidth};
      })()` })).result.value;
      const capture = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from(capture.data, 'base64'));
      console.log(JSON.stringify({ name, ...report }));
      if (report.clipped || report.horizontalOverflow || !report.reachable) throw Error(`Layout check failed: ${name}`);
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
