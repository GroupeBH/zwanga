const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { passengerPanelApproach } = loader()('features/driver-navigation/driverPassengerPanelVisibility.ts');
const tripId = 'trip';
const stop = () => ({ id: 'dropoff-one', type: 'dropoff', completed: false, location: { lat: 0, lng: 20 },
  booking: { id: 'one', tripId, status: 'accepted', pickedUp: true } });
const fix = (meters, now = Date.now()) => ({ timestamp: now,
  coords: { latitude: meters / 6371000 * 180 / Math.PI, longitude: 20, accuracy: 10 } });

test('only a server-boarded dropoff with a fresh precise GPS fix can hide the card', () => {
  const now = Date.now();
  assert.equal(passengerPanelApproach(tripId, stop(), fix(600, now), now).near, false);
  for (const meters of [0, 10, 499.99, 500]) assert.equal(passengerPanelApproach(tripId, stop(), fix(meters, now), now).near, true);
  assert.equal(passengerPanelApproach(tripId, stop(), fix(500.01, now), now).near, false);
  for (const patch of [{ type: 'pickup' }, { completed: true }, { booking: { ...stop().booking, pickedUp: false, pickedUpConfirmedByPassenger: true } },
    { booking: { ...stop().booking, status: 'cancelled' } }, { booking: { ...stop().booking, tripId: 'another' } },
    { location: { lat: NaN, lng: 0 } }]) assert.equal(passengerPanelApproach(tripId, { ...stop(), ...patch }, fix(600, now), now), null);
  for (const gps of [null, fix(600, now - 30000), fix(600, now + 1),
    { ...fix(600, now), coords: { ...fix(600).coords, accuracy: 101 } },
    { ...fix(600, now), coords: { ...fix(600).coords, accuracy: null } }]) assert.equal(passengerPanelApproach(tripId, stop(), gps, now), null);
});

test('500 m reveal stays latched despite GPS jitter; another passenger/destination resets it', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const { usePassengerPanelVisibility } = loader({ react: hooks.react })('hooks/driver-navigation/usePassengerPanelVisibility.ts');
  let waypoint = stop(), gps = fix(900), enabled = true;
  const render = () => hooks.render(() => usePassengerPanelVisibility(tripId, waypoint, gps, enabled));
  assert.equal(render(), true);
  gps = fix(499); assert.equal(render(), false);
  gps = fix(550); assert.equal(render(), false);
  gps = null; assert.equal(render(), false);
  gps = fix(900); assert.equal(render(), false);
  waypoint = { ...stop(), id: 'dropoff-two' }; assert.equal(render(), true);
  enabled = false; assert.equal(render(), false, 'offline, urgent reservation or inactive screen always shows context');
  enabled = true; waypoint = { ...stop(), location: { lat: 1, lng: 21 } }; assert.equal(render(), true);
});

test('GPS expiry restores access even when there are no further GPS or network renders', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const { usePassengerPanelVisibility } = loader({ react: hooks.react })('hooks/driver-navigation/usePassengerPanelVisibility.ts');
  const gps = fix(900), waypoint = stop();
  const render = () => hooks.render(() => usePassengerPanelVisibility(tripId, waypoint, gps, true));
  assert.equal(render(), true);
  t.mock.timers.tick(30000);
  assert.equal(render(), false);
});
