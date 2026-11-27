/* global __dirname */
// Real pickup component and sizing hook, synthetic data and a neutral map placeholder. No API/GPS.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { Buffer } = require('node:buffer');
const React = require('react'), web = require('react-native-web');
const { renderToStaticMarkup } = require('react-dom/server');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const { chromium } = require('./preview-arrival-payment.cjs');
const h = React.createElement, noop = () => {};

function fixture(mode, width, height, fontScale) {
  const native = { ...web, Platform: { OS: 'android', select: x => x.android ?? x.default },
    Text: props => {
      const style = web.StyleSheet.flatten(props.style) ?? {}, ratio = Math.min(fontScale, props.maxFontSizeMultiplier ?? fontScale);
      return h(web.Text, { ...props, style: [props.style, { fontSize: (style.fontSize ?? 14) * ratio,
        ...(style.lineHeight ? { lineHeight: style.lineHeight * ratio } : {}) }] });
    },
    useWindowDimensions: () => ({ width, height, fontScale }),
  };
  const load = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', {
      'aria-hidden': true, style: { color, fontSize: size, width: size, flexShrink: 0, textAlign: 'center' },
    }, ({ 'checkmark-circle': '✓', location: '⌖', 'location-outline': '⌖', 'time-outline': '◷', 'arrow-forward': '→', 'cloud-offline-outline': '☁' })[name] ?? '○') },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true },
  });
  const { HomeRequestPickupSheet } = load('components/home/HomeRequestPickupSheet.tsx');
  const { HomeAcceptedDriverCourseSheet } = load('components/home/HomeAcceptedDriverCourseSheet.tsx');
  const { useHomeSheet } = load('hooks/home/useHomeSheet.ts');
  const { homeRequestPickupPresentation } = load('features/home/homeRequestPickup.ts');
  const { getTabBarMetrics } = load('constants/navigation.ts');
  const now = Date.now(), tabHeight = getTabBarMetrics(0, fontScale).height;
  const vehicle = { brand: 'Toyota', model: 'Highlander', color: 'Gris', licensePlate: 'TEST-001' };
  const request = { id: 'preview-request', tripId: 'preview-trip', passengerId: 'preview-passenger',
    selectedDriverId: 'preview-driver', selectedDriverName: 'Alex M.', selectedVehicle: vehicle,
    departure: { name: 'Avenue de démonstration' } };
  const summary = { requestId: request.id, tripId: request.tripId, viewerRole: 'passenger',
    status: mode === 'estimated' ? 'estimated' : 'waiting_location',
    driver: { id: request.selectedDriverId, name: fontScale > 1 ? 'Conducteur avec un nom particulièrement long' : request.selectedDriverName,
      position: mode === 'estimated' ? { latitude: -4.3, longitude: 15.3, updatedAt: new Date(now).toISOString() } : null },
    passenger: { id: request.passengerId }, vehicle,
    pickup: { location: fontScale > 1 ? 'Avenue de démonstration avec un nom particulièrement long' : request.departure.name,
      reference: mode === 'estimated' ? 'Devant la pharmacie' : null, coordinates: null },
    estimate: mode === 'estimated' ? { distanceMeters: 2400, durationSeconds: 301 } : null,
    generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString(),
  };
  function Preview() {
    const sizing = useHomeSheet({ width, height, insets: { bottom: 0 }, hasRequestPickup: true,
      latestTrips: [], availableDriverRequests: [] });
    if (mode === 'driver') return h(HomeAcceptedDriverCourseSheet, { ...sizing, width, openTripRequestDetail: noop,
      acceptedDriverCourse: { trip: { id: request.tripId, tripRequestId: request.id }, request: {
        ...request, passengerName: fontScale > 1 ? 'Passager avec un nom particulièrement long' : 'Alex M.',
        departure: { name: 'Avenue de démonstration', reference: 'Devant la pharmacie' },
        arrival: { name: 'Marché de démonstration', reference: 'Entrée principale' },
      } } });
    return h(HomeRequestPickupSheet, { ...sizing, width, homeRequestPickup: request,
      pickupModel: mode === 'offline' ? null : homeRequestPickupPresentation(summary, request, request.passengerId, now),
      pickupOnline: mode !== 'offline', pickupLoading: false, openTripRequestDetail: noop });
  }
  const markup = renderToStaticMarkup(h(Preview));
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>${web.StyleSheet.getSheet().textContent}
    html,body{height:100%;margin:0;font-family:Arial,sans-serif}#root{position:relative;height:calc(100% - ${tabHeight}px);background:#DCECE7}
    .map{padding:32px;color:#526871;font-size:13px}.tabs{height:${tabHeight}px;display:flex;align-items:center;justify-content:space-around;background:white;color:#526071;font-size:12px;border-top:1px solid #eee}</style>
    <main id="root"><div class="map">Carte · aperçu sans GPS</div>${markup}</main><nav class="tabs"><span>Accueil</span><span>Recherche</span><span>Mes trajets</span><span>Services</span><span>Profil</span></nav></html>`;
}

async function run() {
  const directory = path.resolve(__dirname, '../.expo/home-pickup-preview'); fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium(process.argv[2], fs.mkdtempSync(path.join(directory, 'browser-')));
  const cases = [['waiting', 390, 844, 1], ['estimated', 390, 844, 1], ['offline', 320, 568, 1],
    ['estimated', 320, 568, 2], ['waiting', 320, 568, 2], ['estimated', 844, 390, 1],
    ['driver', 390, 844, 1], ['driver', 320, 568, 1], ['driver', 320, 568, 2], ['driver', 844, 390, 1]];
  try {
    for (const [mode, width, height, scale] of cases) {
      const name = `${mode}-${width}-${scale}`, file = path.join(directory, `${name}.html`);
      fs.writeFileSync(file, fixture(mode, width, height, scale));
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
        const button=document.querySelector('[role=button]'), b=button.getBoundingClientRect();
        const panel=document.querySelector('[data-testid=home-request-pickup], [data-testid=home-accepted-driver-course]'), p=panel.getBoundingClientRect();
        const clipped=[],unreachable=[],scroll=panel.firstElementChild;
        for(const el of scroll.querySelectorAll('[dir=auto]')){
          el.scrollIntoView({block:'end',inline:'nearest'}); const r=el.getBoundingClientRect(),s=scroll.getBoundingClientRect();
          if(r.left < -1||r.right>innerWidth+1)clipped.push(el.textContent);
          if(r.bottom>s.bottom+1||r.bottom<s.top)unreachable.push(el.textContent);
        }
        const horizontal=document.documentElement.scrollWidth>innerWidth;
        document.querySelectorAll('*').forEach(el=>{el.scrollTop=0;el.scrollLeft=0;});
        return {clipped,unreachable,horizontal,buttonVisible:b.top>=p.top&&b.bottom<=p.bottom+1&&b.height>=44,panelHeight:p.height};})()` })).result.value;
      fs.writeFileSync(path.join(directory, `${name}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      console.log(name, JSON.stringify(report));
      if (report.clipped.length || report.unreachable.length || report.horizontal || !report.buttonVisible) process.exitCode = 1;
      if (scale > 1 || width > height) {
        await send('Runtime.evaluate', { expression: "const s=document.querySelector('[data-testid=home-request-pickup], [data-testid=home-accepted-driver-course]').firstElementChild;s.scrollTop=s.scrollHeight;" });
        fs.writeFileSync(path.join(directory, `${name}-scrolled.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
      }
      await browser.send('Target.closeTarget', { targetId });
    }
  } finally { await browser.close(); }
}
if (require.main === module) run().catch(error => { console.error(error.stack); process.exitCode = 1; });
