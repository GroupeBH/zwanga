/* global __dirname */
// Read-only evidence for one UI publication on the explicitly confirmed test account.
const fs = require('node:fs');
const path = require('node:path');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
const file = path.resolve(__dirname, '../../.expo/local-publication-reprise-20261114.json');
(async () => {
  const runtime = await inspect();
  if (!runtime.localApi || !runtime.development || !runtime.authenticated) throw Error('Local authenticated development runtime required');
  const session = await evaluate(`(()=>{const a=${findModule('store/index.ts')}.store.getState().auth;return {token:a.accessToken,id:a.user?.id}})()`);
  const response = await fetch('http://127.0.0.1:5200/api/v1/trips/my-trips', {
    redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + session.token },
  });
  if (!response.ok) throw Error('Trip read HTTP ' + response.status);
  const body = await response.json(), trips = Array.isArray(body) ? body : body.data;
  if (!Array.isArray(trips)) throw Error('Unexpected list shape');
  const command = process.argv[2];
  if (command === 'baseline') {
    if (fs.existsSync(file)) throw Error('Baseline already exists; refusing to overwrite');
    fs.writeFileSync(file, JSON.stringify({ startedAt: new Date().toISOString(), driverId: session.id, before: trips.map(t => t.id), observations: [] }, null, 2));
    console.log(JSON.stringify({ baselineSaved: true, count: trips.length }));
    return;
  }
  if (command !== 'verify') throw Error('Use baseline or verify');
  const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (ledger.driverId !== session.id || Date.now() - Date.parse(ledger.startedAt) > 7200000) throw Error('Session or time window mismatch');
  const added = trips.filter(t => !ledger.before.includes(t.id));
  if (added.length !== 1) throw Error('Expected exactly one newly published test trip');
  const trip = added[0];
  if (ledger.tripId && ledger.tripId !== trip.id) throw Error('New trip identity changed');
  ledger.tripId = trip.id;
  const observation = { timestamp: new Date().toISOString(), status: trip.status,
    pricePerSeat: Number(trip.pricePerSeat), availableSeats: trip.availableSeats,
    hasDeparture: !!trip.departureLocation, hasArrival: !!trip.arrivalLocation,
    hasVehicle: !!(trip.vehicleId || trip.vehicle?.id),
    recurrence: trip.isRecurring ?? trip.recurring ?? null,
    departureInFuture: Date.parse(trip.departureDate) > Date.now(),
    bookingsCount: Array.isArray(trip.bookings) ? trip.bookings.length : null };
  ledger.observations.push(observation);
  fs.writeFileSync(file, JSON.stringify(ledger, null, 2));
  console.log(JSON.stringify({ uniqueNewTrip: true, ...observation }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
