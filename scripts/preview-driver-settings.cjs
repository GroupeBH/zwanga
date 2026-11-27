/* global __dirname */
/* Actual React Native Web settings components; synthetic permissions, no API/GPS/notifications. */
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(mode, fontScale, platform) {
  const native = { ...web, Platform: { OS: platform, Version: 35, select: x => x[platform] ?? x.default },
    Text: props => {
      const style = web.StyleSheet.flatten(props.style) ?? {}, ratio = Math.min(fontScale, props.maxFontSizeMultiplier ?? fontScale);
      return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * ratio,
        ...(style.lineHeight ? { lineHeight: style.lineHeight * ratio } : {}) }] });
    },
    useWindowDimensions: () => ({ width: 390, height: 844, fontScale }),
  };
  const load = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', {
      'aria-hidden': true, style: { color, fontSize: size, minWidth: size, textAlign: 'center' },
    }, ({ 'arrow-back': '←', 'chevron-forward': '›', 'chevron-down': '⌄', 'location-outline': '⌖', 'notifications-outline': '♧' })[name] ?? '○') },
    'react-native-safe-area-context': { SafeAreaView: ({ style, children }) => h(web.View, { style }, children) },
    'expo-router': { useRouter: () => ({ canGoBack: () => true, back: noop }) },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: 'preview', role: 'driver' } }, zwangaApi: { config: { online: mode !== 'offline' } } }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/driverDispatchApi': { useDriverDispatchStatusQuery: () => ({ data: { enabled: true, automatic: true, available: true } }) },
    '@/services/driverAlertChannel': { openDriverAlertSettings: noop },
    '@/hooks/profile/useNearbyLocationPermission': { useNearbyLocationPermission: () => ({
      loaded: true, enabled: true, permission: mode !== 'missing', consent: false, busy: false,
      setConsent: noop, authorize: noop, disable: noop, defer: noop,
    }) },
    '@/hooks/notifications/useDriverFullScreenPermission': { useDriverFullScreenPermission: () => ({
      permission: { optIn: mode !== 'missing', allowed: mode !== 'missing', notificationsAllowed: true, channelReady: true },
      setOptIn: noop, openNotifications: noop,
    }) },
    '@/services/nearbyDriverLocationHealth': { subscribeNearbyDriverHealth: () => noop, getNearbyDriverLocationHealth: () => ({ lastSentAt: null }) },
  });
  const markup = renderToStaticMarkup(h(load('app/driver-availability.tsx').default));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{height:100%;display:flex;flex-direction:column;background:white}</style>
    <main id="root">${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/driver-settings-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try {
    for (const [mode, platform] of [['authorized', 'android'], ['missing', 'android'], ['offline', 'ios']]) {
      for (const [width, height, scale] of [[390, 844, 1], [320, 568, 2]]) {
        const name = `${mode}-${platform}-${width}-${scale}`, file = path.join(directory, `${name}.html`);
        fs.writeFileSync(file, fixture(mode, scale, platform));
        const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
        const send = (method, params) => browser.send(method, params, sessionId);
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
        await send('Page.navigate', { url: pathToFileURL(file).href });
        for (let n = 0; n < 50; n++) {
          if ((await send('Runtime.evaluate', { expression: "document.readyState==='complete' && !!document.querySelector('[role=button]')", returnByValue: true })).result?.value) break;
          await new Promise(r => setTimeout(r, 50));
        }
        const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const clipped=[];
          for(const el of document.querySelectorAll('[role=button],[role=checkbox],[role=switch]')){
            el.scrollIntoView({block:'nearest',inline:'nearest'}); const b=el.getBoundingClientRect();
            if(b.left < -1||b.right>innerWidth+1||b.top < -1||b.bottom>innerHeight+1)clipped.push(el.textContent);
          }
          const horizontal=document.documentElement.scrollWidth>innerWidth;
          document.querySelectorAll('*').forEach(el=>{el.scrollTop=0;el.scrollLeft=0;});
          return {clipped,horizontal};})()` })).result.value;
        fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
        console.log(name, JSON.stringify(report));
        if (report.clipped.length || report.horizontal) process.exitCode = 1;
        await browser.send('Target.closeTarget', { targetId });
      }
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
