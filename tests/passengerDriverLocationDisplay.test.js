const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { createDriverLocationDisplay } = loader()('features/passenger-navigation/driverLocationDisplay.ts');

test('duplicate, out-of-order and burst positions do not saturate the passenger map', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const updates = [], display = createDriverLocationDisplay((coordinate, timestamp) => updates.push({ coordinate, timestamp }));
  const coordinate = { latitude: -4.3, longitude: 15.3 };
  for (let i = 0; i < 1000; i++) display.push(coordinate, 100000);
  assert.equal(updates.length, 1);
  for (let i = 1; i <= 1000; i++) display.push({ ...coordinate, longitude: 15.3 + i / 100000 }, 100000 + i);
  assert.equal(updates.length, 1); t.mock.timers.tick(2000);
  assert.equal(updates.length, 2); assert.equal(updates[1].timestamp, 101000);
  display.push(coordinate, 99999); t.mock.timers.tick(2000); assert.equal(updates.length, 2);
  display.dispose();
});

test('background/unmount cancels the pending map update', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  let updates = 0; const display = createDriverLocationDisplay(() => { updates++; });
  display.push({ latitude: -4.3, longitude: 15.3 }, 1);
  display.push({ latitude: -4.3, longitude: 15.4 }, 2);
  display.dispose(); t.mock.timers.tick(60000); display.push({ latitude: -4.3, longitude: 15.5 }, 3);
  assert.equal(updates, 1);
});
