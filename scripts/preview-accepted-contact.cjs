/* global __dirname */
// Real contact components, synthetic data, RN-Web. No API, phone call or native map.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(fontScale, long = false) {
  const now = Date.now();
  const summary = { requestId: 'preview', viewerRole: 'driver', status: 'estimated',
    generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30_000).toISOString(),
    driver: { id: 'preview-driver' }, passenger: { id: 'preview-passenger', name: 'Passager de démonstration', position: null },
    pickup: { location: long ? 'Avenue de démonstration avec un nom particulièrement long' : 'Avenue de démonstration',
      reference: 'Devant la pharmacie', coordinates: { latitude: -4.3, longitude: 15.3 } },
    estimate: { distanceMeters: 800, durationSeconds: 180 },
  };
  const native = { ...web, StyleSheet: { ...web.StyleSheet,
    create: values => web.StyleSheet.create(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
      ...value, ...(value.fontSize ? { fontSize: value.fontSize * fontScale } : {}),
      ...(value.lineHeight ? { lineHeight: value.lineHeight * fontScale } : {}),
    }]))),
  } };
  const load = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', {
      'aria-hidden': true, style: { fontSize: size, color, width: size, flexShrink: 0, textAlign: 'center' },
    }, ({ close: '×', 'chatbubble-ellipses-outline': '▤', 'call-outline': '☎', 'logo-whatsapp': '◉', 'chevron-forward': '›' })[name]) },
    '@react-navigation/native': { useIsFocused: () => true },
    '@/components/forms/FormLayout': { FormModal: ({ children }) => h(web.View, { style: { flex: 1 } }, children) },
    'react-native-safe-area-context': { SafeAreaView: ({ children, style }) => h(web.View, { style }, children) },
    '@/hooks/navigation/useTripContactMessaging': { useContactMessaging: () => ({ canMessage: true, userId: 'preview-driver', cancel: noop, openMessage: noop }) },
    '@/utils/phoneHelpers': { openPhoneCall: noop, openWhatsApp: noop },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: 'preview-driver' } } }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: enabled => enabled, displayReadOptions: () => ({}) },
    '@/store/api/requestPickupApi': { useGetRequestPickupSummaryQuery: () => ({ currentData: summary, fulfilledTimeStamp: now }) },
  });
  const { ContactModalContent } = load('features/navigation/NavigationContactModal.tsx');
  const { RequestPickupSummaryCard } = load('features/request-detail/RequestPickupSummaryCard.tsx');
  const markup = renderToStaticMarkup(h(ContactModalContent, { active: true, compact: true, role: 'driver',
    title: 'Joindre le passager', hint: 'À l’arrêt uniquement.', closeLabel: 'Plus tard', onClose: noop,
    contacts: [{ id: 'preview-passenger', name: 'Passager de démonstration', phone: '0999000111', detail: 'À prendre en charge' }],
    summary: h(RequestPickupSummaryCard, { requestId: 'preview', active: true, contactPreview: true }),
  }));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    ${web.StyleSheet.getSheet().textContent}html,body{margin:0;height:100%;font-family:Arial,sans-serif}#root{height:100%;display:flex;flex-direction:column;background:#DCECE8}</style><main id="root">${markup}</main></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/accepted-contact-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  try {
    for (const [width, height, fontScale] of [[390, 844, 1], [320, 568, 1], [320, 568, 2]]) {
      const name = `${width}-${fontScale}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture(fontScale, fontScale > 1));
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (method, params) => browser.send(method, params, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let attempt = 0; attempt < 40; attempt++) {
        if ((await send('Runtime.evaluate', { expression: "document.readyState === 'complete' && !!document.querySelector('[role=button]')", returnByValue: true })).result?.value) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const report = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const visible = el => { const r=el.getBoundingClientRect();
          if(r.width<1||r.height<1||r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)return false;
          for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();
            if(/hidden|auto|scroll/.test(s.overflowY)&&(r.top<b.top-1||r.bottom>b.bottom+1))return false;}return true; };
        const buttons=[...document.querySelectorAll('[role=button]')].filter(el=>el.textContent.trim());
        const allInitiallyVisible=buttons.every(visible);
        const clipped=buttons.filter(el=>{el.scrollIntoView({block:'nearest'});return !visible(el);}).map(el=>el.textContent);
        const horizontal=[...document.querySelectorAll('*')].some(el=>el.clientWidth&&el.scrollWidth>el.clientWidth+1);
        document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});
        return {allInitiallyVisible,clipped,horizontal};})()` })).result.value;
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      console.log(name, JSON.stringify(report));
      if (report.clipped.length || report.horizontal || (fontScale === 1 && !report.allInitiallyVisible)) process.exitCode = 1;
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
