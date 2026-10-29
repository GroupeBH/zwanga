const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { clusterSearchVehicles } = loader()('features/request-detail/requestVehicleClusters.ts');
const region = { latitude: -4.3, longitude: 15.3, latitudeDelta: 0.1, longitudeDelta: 0.1 };
const vehicle = (i, coordinate = {}) => ({ id: String(i), latitude: -4.3, longitude: 15.3,
  vehicleType: 'car', ageMs: 800000, ...coordinate });
const represented = pins => pins.reduce((sum, pin) => sum + (pin.kind === 'group' ? pin.count : 1), 0);

test('small fleets retain every exact coordinate, type and last-known age', () => {
  const vehicles = [vehicle(1), vehicle(2, { latitude: -4.301, vehicleType: 'motorcycle_2_wheels' })];
  const pins = clusterSearchVehicles(vehicles, region);
  assert.equal(pins.length, 2); assert.equal(pins[0].vehicle, vehicles[0]); assert.equal(pins[1].vehicle, vehicles[1]);
});
test('500 vehicles cost at most 64 native pins without removing a candidate or changing stored positions', () => {
  const vehicles = Array.from({ length: 500 }, (_, i) => vehicle(i, {
    latitude: -4.349 + (i % 20) * .005, longitude: 15.251 + Math.floor(i / 20) * .004 }));
  const before = JSON.stringify(vehicles);
  const pins = clusterSearchVehicles(vehicles, region);
  assert(pins.length <= 64); assert.equal(represented(pins), 500);
  assert.equal(JSON.stringify(vehicles), before);
  for (const pin of pins.filter(pin => pin.kind === 'group')) {
    assert(Number.isFinite(pin.coordinate.latitude)); assert(Number.isFinite(pin.coordinate.longitude));
    assert(pin.bounds[0].latitude < pin.bounds[1].latitude);
  }
});
test('zoom and pan reveal original vehicles without dropping candidates outside the viewport', () => {
  const vehicles = Array.from({ length: 500 }, (_, i) => vehicle(i, {
    latitude: -4.349 + (i % 20) * .005, longitude: 15.251 + Math.floor(i / 20) * .004 }));
  const small = { ...region, latitude: vehicles[0].latitude, longitude: vehicles[0].longitude, latitudeDelta: .001, longitudeDelta: .001 };
  assert.deepEqual(clusterSearchVehicles(vehicles, small), [{ kind: 'vehicle', vehicle: vehicles[0] }]);
  assert.deepEqual(clusterSearchVehicles(vehicles, { ...small, latitude: vehicles[499].latitude, longitude: vehicles[499].longitude }),
    [{ kind: 'vehicle', vehicle: vehicles[499] }]);
  assert.equal(represented(clusterSearchVehicles(vehicles, region)), 500);
});
test('coincident vehicles remain one explicit count and invalid regions never reach native commands', () => {
  const vehicles = Array.from({ length: 500 }, (_, i) => vehicle(i));
  const pins = clusterSearchVehicles(vehicles, region);
  assert.equal(pins.length, 1); assert.equal(pins[0].count, 500);
  for (const patch of [{ latitude: NaN }, { longitudeDelta: 0 }, { latitudeDelta: Infinity }, { latitudeDelta: -1 }])
    assert.deepEqual(clusterSearchVehicles(vehicles, { ...region, ...patch }), []);
  assert.deepEqual(clusterSearchVehicles([], region), []);
});
