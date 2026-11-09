const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { requestTotalPrice, requestPriceLabel, requestTripPriceLabel, requestUnitPriceInput, requestTotalInputHint } =
  load('features/trip-request/requestPriceDisplay.ts');

test('command display totals one or multiple ordered seats, without changing the unit contract', () => {
  for (const seats of [1, 2, 3, 4, 20]) {
    const total = requestTotalPrice(2500, seats);
    assert.equal(total, 2500 * seats);
    assert.equal(requestUnitPriceInput(String(total), seats, 0), '2500');
  }
  assert.equal(requestPriceLabel(2500, 2), '5 000 FC');
  assert.equal(requestPriceLabel('2500.50', '2'), '5 001 FC');
  assert.equal(requestTotalPrice(0, 2), 0);
  assert.equal(requestTotalPrice(199.9, 2), 399.8);
});

test('missing/invalid prices and seat counts cannot invent a zero or a total', () => {
  for (const price of [null, undefined, '', ' ', NaN, Infinity, -1, '1e3', true]) {
    assert.equal(requestTotalPrice(price, 2), null);
    assert.equal(requestPriceLabel(price, 2), 'Prix à préciser');
  }
  for (const seats of [null, undefined, '', ' ', NaN, Infinity, -1, 0, 1.5, true]) {
    assert.equal(requestTotalPrice(5000, seats), null);
  }
  assert.equal(requestTotalPrice(Number.MAX_SAFE_INTEGER, 20), null);
});

test('passenger and driver detail presentation use the accepted offer total rather than the old budget', () => {
  const { buildRequestDetailPresentation } = loader({ 'react-native': { Platform: { OS: 'android', select: x => x.android },
    StyleSheet: { create: x => x } } })('features/request-detail/requestPresentation.ts');
  const request = { id: 'test', status: 'pending', numberOfSeats: 3, maxPricePerSeat: 2000,
    departureDateMin: '2099-01-01T10:00:00Z', departureDateMax: '2099-01-01T11:00:00Z' };
  const props = { tripRequest: request, compatibleActiveVehicles: [], requestedVehicleType: 'car' };
  assert.equal(buildRequestDetailPresentation(props).ownerDisplayedBudget, 6000);
  assert.equal(buildRequestDetailPresentation({ ...props, tripRequest: { ...request,
    status: 'driver_selected', selectedPricePerSeat: 2500 } }).ownerDisplayedBudget, 7500);
  assert.equal(buildRequestDetailPresentation({ ...props, tripRequest: { ...request, maxPricePerSeat: null } }).ownerDisplayedBudget, null);
});

test('an entered total is never silently rounded or multiplied twice for the API', () => {
  assert.equal(requestUnitPriceInput('7000', 2), '3500');
  assert.equal(requestUnitPriceInput('5001', 3, 0), '1667');
  assert.equal(requestUnitPriceInput('5000', 3, 0), '');
  assert.equal(requestUnitPriceInput('5000', 3), '');
  assert.equal(requestUnitPriceInput('5000.01', 3), '1666.67');
  assert.match(requestTotalInputHint('5000', 3, 0).replace(/[\u202f\u00a0]/g, ' '), /4 998 FC ou 5 001 FC/);
  assert.equal(requestTotalInputHint('5001', 3, 0), '');
  for (const value of ['', '0', '-1', 'abc', 'NaN', 'Infinity', '1e3']) {
    assert.equal(requestUnitPriceInput(value, 2), '');
  }
});

test('accepted command trip uses booked seats, never vehicle capacity or free seats', () => {
  const trip = { price: 2500, totalSeats: 8, availableSeats: 6,
    passengers: [{ id: 'test-passenger', seats: 2, bookingStatus: 'accepted' }] };
  assert.equal(requestTripPriceLabel(trip), '5 000 FC');
  assert.equal(requestTripPriceLabel({ ...trip, passengers: [] }), 'Prix dans la commande');
  assert.equal(requestTripPriceLabel({ ...trip, passengers: [{ ...trip.passengers[0], seats: undefined }] }), 'Prix dans la commande');
  assert.equal(requestTripPriceLabel({ ...trip, passengers: [{ ...trip.passengers[0], bookingStatus: 'cancelled' }] }), 'Prix dans la commande');
  assert.equal(requestTripPriceLabel({ ...trip, reservationSummary: { acceptedCount: 2 } }), 'Prix dans la commande');
});

test('edit input shows and accepts totals while its parent retains the saved unit budget', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const { RequestTotalBudgetInput } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input' },
  })('components/trip-request/RequestTotalBudgetInput.tsx');
  const sent = [], props = { pricePerSeat: '2700', seats: 2,
    onChangePricePerSeat(value) { sent.push(value); props.pricePerSeat = value; } };
  const render = () => hooks.render(() => RequestTotalBudgetInput(props));
  const input = () => render().props.children[0];
  assert.equal(input().props.value, '5400');
  assert.deepEqual(sent, [], 'rendering is not an edit or mutation');
  input().props.onChangeText('7000');
  assert.equal(input().props.value, '7000'); assert.equal(props.pricePerSeat, '3500');
  input().props.onChangeText('');
  assert.equal(input().props.value, ''); assert.equal(props.pricePerSeat, '');
  input().props.onChangeText('5000');
  assert.equal(props.pricePerSeat, '2500');
  props.seats = 3;
  assert.equal(input().props.value, '7500', 'existing seat pricing rule remains visible');
  input().props.onChangeText('5000');
  assert.equal(props.pricePerSeat, '', 'invalid precision disables parent submission');
  assert.equal(input().props.value, '5000', 'do not erase a draft or silently round it');
  assert.ok(render().props.children[1]);
  props.pricePerSeat = '1500';
  assert.equal(input().props.value, '4500', 'reopening/reset uses server budget');
  input().props.onChangeText('6000,03');
  assert.equal(props.pricePerSeat, '2000.01');
});

test('passenger offer speech uses a known total or omits the amount when the push lacks seats', () => {
  const { passengerResponseNotice } = load('features/notifications/passengerResponseNotice.ts');
  const alert = { kind: 'response', key: 'test', data: { type: 'driver_offer', pricePerSeat: 2500 } };
  assert.doesNotMatch(passengerResponseNotice(alert).message, /FC|par place/);
  const view = passengerResponseNotice({ ...alert, data: { ...alert.data, numberOfSeats: 2 } });
  assert.match(view.message.replace(/[\u202f\u00a0]/g, ' '), /Prix proposé pour le trajet : 5 000 FC/);
  assert.doesNotMatch(view.speech.text, /par place/);
});
