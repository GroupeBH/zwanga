/* global __dirname */
// Read-only contract audit. All addresses, identities, tokens and notifications are synthetic.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const ts = require('typescript');
const { loader } = require('../../tests/helpers/loadTypeScript.cjs');
const root = path.resolve(__dirname, '../..'), backend = path.resolve(root, '../zwanga-backend');
const load = loader();
const { driverNotificationCard, driverNotificationActions } = load('features/notifications/driverNotificationCard.ts');
const { nativeAndroidDriverPush } = load(path.join(backend, 'src/notifications/native-android-driver-push.ts'));
const { iosDriverPush } = load(path.join(backend, 'src/notifications/ios-driver-push.ts'));
const { rideSpeechData } = load(path.join(backend, 'src/notifications/ride-speech-data.ts'));
const { rideCardContent } = load(path.join(backend, 'src/notifications/ride-card-content.ts'));
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const report = { cases: [], observations: [], native: null };
const normalized = s => s.replace(/[\u202f\u00a0]/g, ' ');
const until = new Date(Date.now()+60000).toISOString();
function fixture(type = 'trip_request_nearby', price = '2500', address = 'Départ test') {
  return { id: uuid(1), userId: uuid(2), title: type === 'new_booking' ? 'Nouvelle réservation' : 'Commande programmée à proximité',
    body: 'Demain à 10:00 · Départ test → Arrivée test · 2 places. Consultez la commande.',
    data: { type, driverId: uuid(2), passengerId: uuid(3), tripRequestId: uuid(4), bookingId: uuid(5), offerId: uuid(6),
      ringAlert: 'nearby-request-v1', role: 'driver', expiresAt: until, alertExpiresAt: until,
      ...rideSpeechData({ departure: address, arrival: 'Arrivée test', pricePerSeat: price,
        priceKind: type === 'new_booking' ? 'fare' : 'budget', seats: 2, departureAt: new Date('2026-10-28T09:00:00.000Z') }) } };
}
// Execute the real Expo transport method with a fake HTTP boundary. Do not initialize Nest or load .env.
async function expoPayload(notification) {
  const source = fs.readFileSync(path.join(backend, 'src/notifications/notifications.service.ts'), 'utf8');
  const start = source.indexOf('  private async sendExpoPushNotification('), end = source.indexOf('  private isPassengerRideResponse(', start);
  assert.ok(start > 0 && end > start);
  const compiled = ts.transpileModule(`class Probe { ${source.slice(start, end)} } module.exports = Probe;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let payload; const module = { exports: {} };
  const fetch = async (_url, options) => { payload = JSON.parse(options.body); return { ok: true, json: async () => ({data:{status:'ok',id:'local-ticket'}}) }; };
  new Function('module','fetch','EXPO_PUSH_API_URL','PUSH_DELIVERY_TIMEOUT_MS','EXPO_TICKET_PREFIX','EXPO_RECEIPT_OK_PREFIX','rideCardContent',compiled)
    (module, fetch, 'https://no-network.invalid', 10000, 'ticket:', 'ok:', rideCardContent);
  const probe = Object.assign(new module.exports(), { driverActionVersion: async () => 5, ringClientVersion: async () => 5,
    isPassengerRideResponse: () => false, isNearbyRequestRing: () => notification.data.type === 'trip_request_nearby',
    isDriverRingInvitation: () => notification.data.type === 'new_booking', driverRingUntil: () => until, driverNotificationTtl: () => 60 });
  await probe.sendExpoPushNotification(notification, 'synthetic-expo-token'); return payload;
}
async function nativeProbe() {
  const adb = process.env.RIDE_AUDIT_ADB, serial = process.env.RIDE_AUDIT_SERIAL || 'emulator-5554';
  if (!adb || !/^emulator-\d+$/.test(serial)) throw Error('Use an explicitly configured local emulator');
  const shell = (...args) => execFileSync(adb, ['-s', serial, 'shell', ...args], { encoding: 'utf8', windowsHide: true, timeout:15000 });
  const now = Number(shell('date','+%s%3N').trim()); assert.ok(Number.isFinite(now));
  const payload = nativeAndroidDriverPush(fixture('new_booking'), 'synthetic', new Date(now+60000).toISOString()).data;
  Object.assign(payload, { notificationId: randomUUID(), bookingId: randomUUID(), expiresAt: new Date(now+60000).toISOString(), alertExpiresAt:new Date(now+60000).toISOString() });
  try {
    shell('input','keyevent','KEYCODE_WAKEUP'); shell('wm','dismiss-keyguard'); shell('input','keyevent','KEYCODE_HOME');
    shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','native-payload','--es','mode','deliver','--es','payload', Buffer.from(JSON.stringify(payload)).toString('base64'));
    const deadline = Date.now()+12000;
    while (Date.now()<deadline) {
      try {
        const result = JSON.parse(shell('run-as','com.zwanga.audit','cat','files/ride-audit-result.json'));
        if (result.notificationId === payload.notificationId) {
          assert.equal(result.count,1); assert.equal(result.actions,2); assert.match(result.template,/BigTextStyle/);
          const screen = fs.readFileSync(path.join(root,'native/android/notifications/IncomingRideActivity.java'),'utf8');
          report.native = { title: result.title, body: result.body, style: result.template, actions: result.actions,
            titleHasPrice: normalized(result.title).includes('2 500'), bodyHasPrice: normalized(result.body).includes('2 500'),
            fullScreenReadsTitle: screen.includes('Notification.EXTRA_TITLE') };
          return;
        }
      } catch (error) { if (error.code === 'ERR_ASSERTION') throw error; }
      await new Promise(resolve => setTimeout(resolve,200));
    }
    throw Error('Local native probe timed out');
  } finally { shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','clear'); }
}
(async () => {
  let maxAndroid=0, maxIos=0;
  for (const type of ['new_booking','trip_request_nearby','driver_dispatch_offer'])
    for (const price of ['2500','2500.50','0',null,'-1','NaN'])
      for (const address of ['Départ test','É'.repeat(2000),'路'.repeat(2000)]) {
        const item=fixture(type,price,address), android=nativeAndroidDriverPush(item,'synthetic',until), ios=iosDriverPush(item,'synthetic',until);
        assert.equal(android.data.driverId,uuid(2)); assert.equal(android.data.ringUntil,until);
        assert.equal(ios.data.driverId,uuid(2)); assert.equal(ios.data.ringUntil,until);
        assert.equal(ios.apns.payload.aps.sound,'driver_ring.wav');
        assert.equal(android.data.rideMapUrl,undefined);
        if (price === null || price === '-1' || price === 'NaN') {
          assert.equal(android.data.ridePricePerSeat,undefined);
          assert.doesNotMatch(android.data.title,/Gratuit|FC/);
        }
        const a=Buffer.byteLength(JSON.stringify(android.data)), b=Buffer.byteLength(JSON.stringify({data:ios.data,apns:ios.apns}));
        assert.ok(a<4000 && b<3800); maxAndroid=Math.max(a,maxAndroid); maxIos=Math.max(b,maxIos);
        report.cases.push({ type, price: price ?? 'missing', addressLength:address.length, androidBytes:a,iosBytes:b });
      }
  const request=fixture(), js=driverNotificationCard('nearby',request.data), ios=iosDriverPush(request,'synthetic',until).apns.payload.aps.alert;
  const expo=await expoPayload(request), booking=await expoPayload(fixture('new_booking'));
  report.observations.push({ name:'scheduled_details', mobileBody:js.body, iosBody:ios.body, iosTitle:ios.title,
    mobileHasTime:js.body.includes('10:00'), iosHasTime:ios.body.includes('10:00'), mobileHasSeats:js.body.includes('2 places'),iosHasSeats:ios.body.includes('2 places') });
  report.observations.push({ name:'expo_price', requestTitle:expo.title, bookingTitle:booking.title,
    requestPriceVisible:/2.?500/.test(expo.title+expo.body), bookingPriceVisible:/2.?500/.test(booking.title+booking.body) });
  for (const card of [js, ios, expo, booking]) {
    assert.match(normalized(card.title), /2 500/);
    assert.match(card.body, /2 places/); assert.match(card.body, /10:00/);
  }
  report.observations.push({ name:'shared_actions', mobile:driverNotificationActions('nearby',{sharedTrip:'true'}).map(a=>a.title) });
  for (let i=0;i<100;i++) driverNotificationCard('nearby',request.data);
  const started=performance.now(); for(let i=0;i<1000;i++) driverNotificationCard('nearby',request.data);
  report.performance={calls:1000,totalMs:Number((performance.now()-started).toFixed(2)),hostOnly:true};
  if (process.argv.includes('--native')) await nativeProbe();
  const output=path.join(root,'.expo/driver-card-audit-20261027');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,process.argv.includes('--native') ? 'text-contracts-native.json' : 'text-contracts.json'),JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({cases:report.cases.length,maxAndroidBytes:maxAndroid,maxIosBytes:maxIos,
    observations:report.observations,native:report.native,performance:report.performance},null,2)+'\n');
})().catch(error=>{process.stderr.write(String(error.stack)+'\n');process.exitCode=1;});
