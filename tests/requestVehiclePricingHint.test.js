const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('budget hint follows the selected vehicle rate, with legacy API compatibility', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const pricing = { minimumPricePerSeat: 2500, pricePerKmPerPassenger: 1500,
    pricePerDelayMinute: 120, trafficDelaySurchargePerSeat: 0, billableDelaySeconds: 0,
    heavyRain: false, heavyTraffic: false, trafficDataAvailable: true, distanceSource: 'google_directions' };
  const types = ['car', 'motorcycle_2_wheels', 'motorcycle_3_wheels'];
  const rates = [1500, 1200, 1000];
  const vehicleOptions = types.map((vehicleType, i) => ({ vehicleType,
    recommendedPricePerSeat: rates[i] * 5, recommendedTotalPrice: rates[i] * 5,
    availableForRequestedSeats: true, pricing: { ...pricing, pricePerKmPerPassenger: rates[i] } }));
  const { useRequestBudgetSummary } = loader({ react: hooks.react,
    './useRequestVehicleOptions': { useRequestVehicleOptions: () => ({ vehicleOptions, pricing, routeDistanceMeters: 5000 }) },
  })('hooks/trip-request/useRequestBudgetSummary.ts');
  const params = { departureLocation: null, arrivalLocation: null,
    departureManualAddress: 'Departure', arrivalManualAddress: 'Arrival',
    departureReference: '', arrivalReference: '', numberOfSeats: 1, hasSpecifiedNumberOfSeats: true,
    maxPricePerSeat: '', hasEditedBudget: false };
  for (const [i, type] of types.entries()) {
    const result = hooks.render(() => useRequestBudgetSummary({ ...params, selectedVehicleType: type, selectedVehicleTypes: [type] }));
    assert.equal(result.budgetValue, rates[i] * 5);
    assert.match(result.budgetHintLabel, new RegExp(['1 500', '1 200', '1 000'][i] + ' FC/km'));
  }
  delete vehicleOptions[0].pricing;
  const legacy = hooks.render(() => useRequestBudgetSummary({ ...params, selectedVehicleType: 'car', selectedVehicleTypes: ['car'] }));
  assert.match(legacy.budgetHintLabel, /1 500 FC\/km/);
  const manual = hooks.render(() => useRequestBudgetSummary({ ...params, maxPricePerSeat: '8000', hasEditedBudget: true,
    selectedVehicleType: types[1], selectedVehicleTypes: [types[1]] }));
  assert.equal(manual.budgetValue, 8000);
  assert.equal(manual.budgetHintLabel, 'Votre budget pour le trajet');
  const multiple = hooks.render(() => useRequestBudgetSummary({ ...params,
    selectedVehicleType: types[1], selectedVehicleTypes: types }));
  assert.equal(multiple.budgetHintLabel, 'Même budget pour tous les véhicules choisis');
});
