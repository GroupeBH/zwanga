/* global __dirname */
// Interactive, explicitly local audit. Credentials remain in memory, outputs are redacted.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomInt } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { inspect, evaluate, findModule, capture } = require('./mobile-runtime-probe.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function adbShell(...args) {
  if (!process.env.RIDE_AUDIT_ADB) throw Error('Local emulator ADB required');
  return execFileSync(process.env.RIDE_AUDIT_ADB, ['-s', 'emulator-5554', 'shell', ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true });
}
async function acceptSyntheticUi() {
  const until = Date.now() + 25000;
  while (Date.now() < until) {
    adbShell('uiautomator', 'dump', '/sdcard/window-audit.xml');
    const xml = adbShell('cat', '/sdcard/window-audit.xml');
    const match = xml.includes('Départ audit local') && xml.match(/<node\b[^>]*content-desc="Accepter"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (match) {
      const [, x1, y1, x2, y2] = match.map(Number);
      adbShell('input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
      return true;
    }
    await sleep(1000);
  }
  return false;
}
const backend = createRequire(path.resolve(__dirname, '../../../zwanga-backend/package.json'));
const config = backend('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../../zwanga-backend/.env')));
const dbUrl = config.DATABASE_URL ? new URL(config.DATABASE_URL) : null;
const host = dbUrl?.hostname ?? config.DATABASE_HOST ?? 'localhost';
if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw Error('Local database required');
const dbOptions = dbUrl ? { connectionString: config.DATABASE_URL } : {
  host, port: Number(config.DATABASE_PORT || 5432), user: config.DATABASE_USER,
  password: config.DATABASE_PASSWORD, database: config.DATABASE_NAME,
};
const state = { passengers: [], requests: [], driver: null };
const suffix = process.env.AUDIT_REPORT_SUFFIX || '';
if (suffix && !/^[a-z0-9-]+$/.test(suffix)) throw Error('Invalid report suffix');
const reportPath = path.resolve(__dirname, '../../.expo/global-e2e-connected-20261103' + (suffix ? '-' + suffix : '') + '.json');
const events = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : [];
async function sql(query, values = []) {
  const client = new (backend('pg').Client)({ ...dbOptions, connectionTimeoutMillis: 4000, statement_timeout: 5000 });
  try { await client.connect(); await client.query('BEGIN READ ONLY'); return (await client.query(query, values)).rows; }
  finally { await client.end(); }
}
async function api(route, actor, method = 'GET', body) {
  if (!route.startsWith('/') || route.includes('://')) throw Error('Relative path required');
  const response = await fetch('http://127.0.0.1:5200/api/v1' + route, {
    method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error('Local HTTP ' + response.status + ' ' + (data.code || data.error?.code || '') + ' on ' + route.split('/').slice(0, 2).join('/'));
  return data;
}
async function action(input) {
  if (input.action === 'adopt') {
    const runtime = await inspect();
    if (!runtime.localApi || !runtime.development) throw Error('Local development runtime required');
    const session = await evaluate(`(()=>{const a=${findModule('store/index.ts')}.store.getState().auth;return {token:a.accessToken,refreshToken:a.refreshToken,id:a.user?.id}})()`);
    const currentConfirmed = process.env.AUDIT_USE_CONFIRMED_TEST_SESSION === '1';
    if (!currentConfirmed && !process.env.AUDIT_TEST_DRIVER_PHONE) throw Error('Explicit test-driver designation required');
    const phones = (process.env.AUDIT_TEST_DRIVER_PHONE || '').split(',').map(phone => phone.replace(/\D/g, '').slice(-9));
    const [driver] = currentConfirmed
      ? await sql('SELECT id, role FROM users WHERE id=$1', [session.id])
      : await sql('SELECT id, role FROM users WHERE id=$1 AND right(regexp_replace(phone,\'[^0-9]\',\'\',\'g\'),9)=ANY($2::text[])', [session.id, phones]);
    if (driver?.role !== 'driver') throw Error('Session does not match designated local test driver');
    const candidate = { token: session.token, refreshToken: session.refreshToken, user: { id: driver.id } };
    const profile = await api('/users/me', candidate); candidate.user = profile.user ?? profile;
    const vehicles = await api('/vehicles', candidate); candidate.vehicles = Array.isArray(vehicles) ? vehicles : vehicles.data ?? [];
    state.driver = candidate;
    return { adopted: true, role: state.driver.user.role, vehicles: state.driver.vehicles.map(v => ({ type: v.type, active: v.isActive })) };
  }
  if (input.action === 'capture') return capture(input.label);
  if (input.action === 'inspect') return inspect();
  if (input.action === 'stop') { setTimeout(() => process.exit(0), 50); return { stopped: true }; }
  if (!state.driver) throw Error('Adopt the designated local session first');
  if (input.action === 'driver') {
    const trips = await api('/trips/my-trips', state.driver);
    const list = Array.isArray(trips) ? trips : trips.data ?? [];
    const presence = await sql('SELECT ST_X(position::geometry) AS lon, ST_Y(position::geometry) AS lat FROM driver_dispatch_presence WHERE "driverId"=$1', [state.driver.user.id]);
    state.point = presence[0];
    return { hasPosition: !!state.point, tripsByStatus: list.reduce((counts, trip) => {
      counts[trip.status] = (counts[trip.status] || 0) + 1; return counts;
    }, {}) };
  }
  if (input.action === 'passenger') {
    const phone = '+243000' + String(Date.now()).slice(-6);
    const pin = String(randomInt(1000, 9999));
    const result = await api('/auth/register', null, 'POST', { phone, pin, firstName: 'Audit', lastName: 'Local', role: 'passenger' });
    const actor = { token: result.accessToken, refreshToken: result.refreshToken, phone, pin };
    if (!actor.token) throw Error('No local registration session');
    const profile = await api('/users/me', actor); actor.user = profile.user ?? profile;
    state.passengers.push(actor);
    return { created: true, index: state.passengers.length - 1 };
  }
  if (input.action === 'recover-owned-fixture') {
    if (input.confirm !== 'local-targeted-test') throw Error('Explicit synthetic fixture recovery required');
    const rows = await sql(`SELECT r.id, r."tripId", u.id AS "passengerId", u.phone, u.password
      FROM trip_requests r JOIN trips t ON t.id::text=r."tripId"::text JOIN users u ON u.id=r."passengerId"
      WHERE t."driverId"=$1 AND t.status='ongoing' AND r.description=$2
        AND r."createdAt">now()-interval '1 hour' AND u."createdAt">now()-interval '1 hour'
        AND u."firstName"='Audit' AND u."lastName"='Local' AND u.phone LIKE '+243000%'
        AND u.role='passenger' AND u."isActive"=true`,
    [state.driver.user.id, 'Recette locale synthétique, aucune course réelle']);
    if (rows.length !== 1) throw Error('Expected exactly one owned recent synthetic fixture');
    const row = rows[0], pin = String(randomInt(1000, 9999));
    const password = await backend('bcrypt').hash(pin, 10);
    const client = new (backend('pg').Client)({ ...dbOptions, connectionTimeoutMillis: 4000, statement_timeout: 5000 });
    try {
      await client.connect(); await client.query('BEGIN');
      const changed = await client.query('UPDATE users SET password=$1 WHERE id=$2 AND password=$3 AND phone=$4', [password, row.passengerId, row.password, row.phone]);
      if (changed.rowCount !== 1) throw Error('Synthetic fixture changed during recovery');
      await client.query('COMMIT');
    } finally { await client.end(); }
    const login = await api('/auth/login', null, 'POST', { phone: row.phone, pin });
    const actor = { token: login.accessToken, refreshToken: login.refreshToken, phone: row.phone, pin };
    const profile = await api('/users/me', actor); actor.user = profile.user ?? profile;
    if (actor.user.id !== row.passengerId) throw Error('Unexpected fixture identity');
    state.passengers.push(actor); state.requests.push({ id: row.id, tripId: row.tripId, passenger: actor });
    return { recoveredOwnedSyntheticFixture: true, fixturePasswordRotated: true };
  }
  if (input.action === 'close-empty-synthetic-trip') {
    if (input.confirm !== 'local-targeted-test') throw Error('Explicit targeted cleanup required');
    const rows = await sql(`SELECT t.id, t.status FROM trips t
      JOIN trip_requests r ON r.id::text=t."tripRequestId"::text
      WHERE t."driverId"=$1 AND r.description=$2
        AND t."departureLocation"=$3 AND r."createdAt">NOW()-INTERVAL '2 hours'
        AND t.status IN ('upcoming','ongoing')
        AND EXISTS (SELECT 1 FROM bookings b WHERE b."tripId"::text=t.id::text)
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b."tripId"::text=t.id::text AND b.status<>'cancelled')`,
    [state.driver.user.id, 'Recette locale synthétique, aucune course réelle', 'Départ audit local']);
    if (rows.length !== 1) throw Error('Expected exactly one empty synthetic trip');
    const item = rows[0];
    if (item.status === 'upcoming') await api('/trips/' + item.id + '/start', state.driver, 'PUT');
    await api('/trips/' + item.id + '/complete', state.driver, 'PUT');
    const view = await api('/trips/' + item.id, state.driver);
    return { syntheticTripClosed: view.status === 'completed', status: view.status };
  }
  if (input.action === 'request') {
    if (input.confirm !== 'local-targeted-test') throw Error('Explicit targeted test required');
    const passenger = state.passengers.at(-1), point = state.point;
    if (!passenger || !point) throw Error('Synthetic passenger and test-driver position required');
    const result = await api('/trip-requests', passenger, 'POST', {
      targetDriverId: state.driver.user.id, immediateDispatch: true,
      departureLocation: 'Départ audit local', arrivalLocation: 'Arrivée audit local',
      departureCoordinates: [point.lon, point.lat], arrivalCoordinates: [point.lon + 0.006, point.lat - 0.006],
      departureDateMin: new Date(Date.now() + 30000).toISOString(), departureDateMax: new Date(Date.now() + 30 * 60000).toISOString(),
      numberOfSeats: 1, maxPricePerSeat: 3000, vehicleType: state.driver.vehicles[0].type, paymentMode: 'cash',
      description: 'Recette locale synthétique, aucune course réelle',
    });
    const request = result.tripRequest ?? result.data ?? result;
    state.requests.push({ id: request.id, passenger });
    const acceptedViaUi = input.acceptViaUi === true ? await acceptSyntheticUi() : undefined;
    return { created: !!request.id, status: request.status, index: state.requests.length - 1, acceptedViaUi };
  }
  const request = state.requests[input.index ?? state.requests.length - 1];
  if (input.action === 'cancel' && request) {
    await api('/trip-requests/' + request.id, request.passenger, 'DELETE');
    return { syntheticRequestCancelled: true };
  }
  if (input.action === 'session') {
    if (!['driver', 'passenger'].includes(input.role)) throw Error('Unknown fixture role');
    const runtime = await inspect();
    if (!runtime.localApi || !runtime.development) throw Error('Local runtime required');
    const actor = input.role === 'driver' ? state.driver : request?.passenger ?? state.passengers.at(-1);
    if (!actor?.refreshToken) throw Error('Fixture session missing');
    // Hermes' debugger compiler cannot compile async functions: start a normal
    // promise chain and inspect a redacted completion flag instead.
    await evaluate(`(()=>{const s=${findModule('store/index.ts')}.store;
      const a=${findModule('store/slices/authSlice.ts')};
      globalThis.__zwangaAuditSession={done:false,failed:false};
      ${findModule('services/tokenSession.ts')}.invalidateTokenSession();
      s.dispatch(a.logout()); s.dispatch(${findModule('store/api/baseApi.ts')}.baseApi.util.resetApiState());
      s.dispatch(a.saveTokensAndUpdateState(${JSON.stringify({ accessToken: actor.token, refreshToken: actor.refreshToken })})).unwrap().then(saved=>{
        if(!saved)throw Error('Session not saved');s.dispatch(a.setUser(${JSON.stringify(actor.user)}));
        globalThis.__zwangaAuditSession.done=true;
      }).catch(()=>{globalThis.__zwangaAuditSession.failed=true});return true;})()`);
    const deadline = Date.now() + 15000;
    let finished = false;
    while (Date.now() < deadline) {
      const result = await evaluate('globalThis.__zwangaAuditSession');
      if (result?.failed) throw Error('Fixture session not saved');
      if (result?.done) { finished = true; break; }
      await sleep(250);
    }
    if (!finished) throw Error('Fixture session not restored');
    return { sessionPrepared: true, role: input.role, method: 'fixture setup, not UI login' };
  }
  if (input.action === 'navigate' && request) {
    if (!['driver', 'passenger'].includes(input.role)) throw Error('Unknown fixture role');
    const expected = input.role === 'driver' ? state.driver.user.id : request.passenger.user.id;
    const identityMatches = await evaluate(`${findModule('store/index.ts')}.store.getState().auth.user?.id===${JSON.stringify(expected)}`);
    if (!identityMatches) throw Error('Switch to the designated fixture session before navigation');
    const route = input.role === 'driver' ? '/trip/navigate/' + request.tripId : '/booking/navigate/' + request.bookingId;
    if (!request.tripId || !request.bookingId) throw Error('Run status after trip creation first');
    execFileSync(process.env.RIDE_AUDIT_ADB, ['-s', 'emulator-5554', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'zwanga://' + route, 'com.zwanga'], { timeout: 15000 });
    return { openedSyntheticNavigation: true, role: input.role };
  }
  if (input.action === 'open' && request) {
    execFileSync(process.env.RIDE_AUDIT_ADB, ['-s', 'emulator-5554', 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'zwanga://request/' + request.id, 'com.zwanga'], { timeout: 15000 });
    return { openedSyntheticRequest: true };
  }
  if (input.action === 'status' && request) {
    const view = await api('/trip-requests/' + request.id, request.passenger);
    request.tripId = view.tripId ?? view.trip?.id;
    const offers = await sql('SELECT status, phase, "driverId"=$2 AS expected FROM trip_request_dispatch_offers WHERE "requestId"=$1', [request.id, state.driver.user.id]);
    const bookings = request.tripId ? await sql(`SELECT id,status,"paymentStatus","paymentMode","pickedUp","pickedUpConfirmedByPassenger", "droppedOff","droppedOffConfirmedByPassenger","cashReceivedAt" IS NOT NULL AS "cashReceived" FROM bookings WHERE "tripId"::text=$1 AND "passengerId"=$2`, [request.tripId, request.passenger.user.id]) : [];
    request.bookingId = bookings[0]?.id;
    const trip = request.tripId ? await api('/trips/' + request.tripId, state.driver) : null;
    return { status: view.status, hasTrip: !!request.tripId, tripStatus: trip?.status, targetDriverDeclined: view.targetDriverDeclined, offers,
      bookings: bookings.map(({ id: _id, ...item }) => item) };
  }
  if (input.action === 'declare-driver' && request?.bookingId) {
    if (!['pickup', 'dropoff'].includes(input.step)) throw Error('Unsupported fixture declaration');
    await api('/bookings/' + request.bookingId + '/confirm-' + input.step, state.driver, 'PUT', {});
    return { declared: input.step, method: 'driver API', syntheticBookingOnly: true };
  }
  if (input.action === 'cleanup') {
    const outcomes = [];
    const preserved = new Set();
    for (const item of state.requests) {
      try { await api('/trip-requests/' + item.id, item.passenger, 'DELETE'); outcomes.push({ requestCancelled: true }); }
      catch { preserved.add(item.passenger); outcomes.push({ requestCancelled: false, syntheticAccountPreserved: true }); }
    }
    for (const actor of state.passengers) {
      if (preserved.has(actor)) continue;
      try { await api('/users/me', actor, 'DELETE'); outcomes.push({ syntheticAccountDeactivated: true }); }
      catch { outcomes.push({ syntheticAccountDeactivated: false }); }
    }
    return outcomes;
  }
  throw Error('Unsupported action or no synthetic request');
}
let queue = Promise.resolve();
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  queue = queue.then(async () => {
    let result;
    try { const command = JSON.parse(line); result = { action: command.action, result: await action(command) }; }
    catch (error) { result = { error: error.message }; }
    events.push(result);
    fs.writeFileSync(reportPath, JSON.stringify(events, null, 2));
    console.log(JSON.stringify(result));
  });
});
console.log('Local audit controller ready. Tokens are not logged.');
