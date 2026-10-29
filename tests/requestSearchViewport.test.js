const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { requestSearchBounds } = loader()('features/request-detail/requestSearchViewport.ts');
const departure = { latitude: -4.3, longitude: 15.3 };

test('empty search frames the neighbourhood, not the whole city', () => {
  const [south, north] = requestSearchBounds(departure, []);
  assert.ok(north.latitude - south.latitude < .03);
  assert.ok(north.longitude - south.longitude < .03);
  assert.ok(south.latitude < departure.latitude && north.latitude > departure.latitude);
});

test('street-level fit includes every known vehicle and departure, without changing their positions', () => {
  const vehicles = [{ latitude: -4.301, longitude: 15.302, vehicleType: 'car' },
    { latitude: -4.303, longitude: 15.301, vehicleType: 'motorcycle_2_wheels' }];
  const before = JSON.stringify(vehicles);
  const [south, north] = requestSearchBounds(departure, vehicles);
  assert.ok(north.latitude - south.latitude < .01);
  for (const point of [...vehicles, departure]) {
    assert.ok(point.latitude >= south.latitude && point.latitude <= north.latitude);
    assert.ok(point.longitude >= south.longitude && point.longitude <= north.longitude);
  }
  assert.equal(JSON.stringify(vehicles), before);
});

test('more distant known vehicles stay included; malformed coordinates never poison native bounds', () => {
  const vehicle = { latitude: -4.342, longitude: 15.32 };
  const [south, north] = requestSearchBounds(departure, [vehicle,
    { latitude: NaN, longitude: 15 }, { latitude: -4, longitude: Infinity }, { latitude: 91, longitude: 15 }]);
  assert.ok(south.latitude <= vehicle.latitude); assert.ok(north.longitude >= vehicle.longitude);
  assert.ok(south.longitude <= departure.longitude && north.latitude >= departure.latitude);
  assert.ok([south.latitude, south.longitude, north.latitude, north.longitude].every(Number.isFinite));
});
