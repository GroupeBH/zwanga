const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const model = load('features/trip-request/requestFormModel.ts');
const { requestPricingDescription } = load('features/trip-request/pricingDescription.ts');

test('new requests cannot go below 2500, but preserve exact server quotes above the floor', () => {
  assert.equal(model.MIN_REQUEST_PRICE, 2500);
  for (const value of [undefined, 0, -500, 500, 1945, 2499]) assert.equal(model.clampRequestPrice(value), 2500);
  for (const value of [2500, 2630, 7500, 11200]) {
    assert.equal(model.getRequestBudgetState('', false, {
      recommendedPricePerSeat: value, availableForRequestedSeats: true,
    }).budgetValue, value);
  }
  assert.equal(model.clampRequestPrice(11200 + model.REQUEST_PRICE_STEP), 11700);
  assert.equal(model.clampRequestPrice(11200 - model.REQUEST_PRICE_STEP), 10700);
});

test('pricing text describes the applied server rates, delay and incomplete observations', () => {
  const pricing = { minimumPricePerSeat: 2500, pricePerKmPerPassenger: 2000,
    pricePerDelayMinute: 120, trafficDelaySurchargePerSeat: 1200, billableDelaySeconds: 600,
    heavyTraffic: true, heavyRain: true, trafficDataAvailable: true, distanceSource: 'google_directions' };
  assert.equal(requestPricingDescription(pricing),
    '2 000 FC/km (trafic lourd et forte pluie) + 1 200 FC de retard estimé · minimum 2 500 FC/place');
  assert.equal(requestPricingDescription(), null);
  const fallback = requestPricingDescription({ ...pricing, heavyTraffic: false, heavyRain: false,
    billableDelaySeconds: 0, pricePerKmPerPassenger: 1500, distanceSource: 'straight_line', trafficDataAvailable: false });
  assert.match(fallback, /1 500 FC\/km/);
  assert.match(fallback, /distance approximative/);
  assert.match(fallback, /trafic indisponible/);
  assert.doesNotMatch(fallback, /retard estimé/);
});
