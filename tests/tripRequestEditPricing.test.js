const test = require('node:test');
const assert = require('node:assert/strict');
const { skipToken } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function editPricingApp(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  const responses = new Map(), errors = new Set();
  let receivedArgs, lastData, retries = 0;
  const { useEditRequestPricing } = loader({
    react: hooks.react,
    'react-native': { InteractionManager: { runAfterInteractions(callback) { callback(); return { cancel() {} }; } } },
    '@/store/api/tripRequestApi': {
      useTripRequestVehicleOptionsQuery(args) {
        receivedArgs = args;
        const key = JSON.stringify(args);
        const currentData = responses.get(key);
        return { currentData, data: lastData, isFetching: args !== skipToken && !currentData && !errors.has(key),
          isError: errors.has(key), refetch: () => { retries++; } };
      },
    },
  })('hooks/trip-request/useEditRequestPricing.ts');
  const props = {
    enabled: true, requestId: 'request-1', vehicleType: 'car',
    departureAddress: 'Gombe', arrivalAddress: 'Limete', departureReference: '', arrivalReference: '',
    departureLocation: null, arrivalLocation: null, numberOfSeats: 2, hasSpecifiedNumberOfSeats: true,
  };
  const render = () => hooks.render(() => useEditRequestPricing(props));
  const settle = (price = 2000, args = receivedArgs) => {
    lastData = { options: [
      { vehicleType: 'car', recommendedPricePerSeat: price, availableForRequestedSeats: true },
      { vehicleType: 'motorcycle_2_wheels', recommendedPricePerSeat: price * 1.5, availableForRequestedSeats: true },
    ], weatherImpact: { priceMultiplier: 1.2 } };
    responses.set(JSON.stringify(args), lastData);
    return render();
  };
  const ready = () => { t.mock.timers.tick(250); return render(); };
  return { hooks, props, render, ready, settle, args: () => receivedArgs, retries: () => retries,
    fail: () => { errors.add(JSON.stringify(receivedArgs)); return render(); } };
}

test('editing recalculates the price when the route changes without changing vehicle type', t => {
  const app = editPricingApp(t);
  assert.equal(app.render().isPriceLoading, true);
  assert.equal(app.args(), skipToken);
  app.ready();
  assert.equal(app.settle(2000).confirmedPricePerSeat, 2000);
  app.props.arrivalAddress = 'Lemba';
  const recalculating = app.render();
  assert.equal(recalculating.maxPricePerSeat, '');
  assert.equal(recalculating.isBudgetValid, false);
  app.ready();
  const updated = app.settle(3500);
  assert.equal(updated.maxPricePerSeat, '3500');
  assert.equal(updated.confirmedPricePerSeat, 3500);
  assert.equal(updated.vehiclePriceMultiplier, 1.2);
  app.hooks.unmount();
});

test('an obsolete route response cannot replace the current route price', t => {
  const app = editPricingApp(t);
  app.render(); app.ready();
  const originalArgs = app.args();
  app.props.arrivalAddress = 'UPN';
  app.render(); app.ready();
  app.settle(5000);
  const updated = app.settle(1500, originalArgs);
  assert.equal(updated.confirmedPricePerSeat, 5000);
  app.hooks.unmount();
});

test('manual typing is preserved when a recommendation arrives for the same route', t => {
  const app = editPricingApp(t);
  app.render(); app.ready();
  app.render().setMaxPricePerSeat('2750');
  const updated = app.settle(3500);
  assert.equal(updated.confirmedPricePerSeat, 2750);
  assert.equal(updated.hasEditedBudget, true);
  app.hooks.unmount();
});

test('a manual budget is invalidated when route, coordinates, landmark, seats or vehicle change', t => {
  const app = editPricingApp(t);
  app.render(); app.ready(); app.settle(2000);
  for (const change of [
    { arrivalAddress: 'Lemba' },
    { departureLocation: { latitude: -4.31, longitude: 15.31 } },
    { departureReference: 'Gare Centrale' },
    { numberOfSeats: 3 },
    { vehicleType: 'motorcycle_2_wheels' },
  ]) {
    app.render().setMaxPricePerSeat('2750');
    assert.equal(app.render().hasEditedBudget, true);
    Object.assign(app.props, change);
    assert.equal(app.render().hasEditedBudget, false);
    app.ready();
    const updated = app.settle(4000);
    assert.equal(updated.confirmedPricePerSeat, app.props.vehicleType === 'car' ? 4000 : 6000);
  }
  app.hooks.unmount();
});

test('a failed recommendation allows manual pricing without submitting an absent price', t => {
  const app = editPricingApp(t);
  app.render(); app.ready();
  assert.equal(app.fail().isBudgetValid, false);
  assert.equal(app.render().confirmedPricePerSeat, undefined);
  app.render().setMaxPricePerSeat('4500');
  assert.equal(app.render().isBudgetValid, true);
  assert.equal(app.render().confirmedPricePerSeat, 4500);
  app.render().retryVehicleOptions();
  assert.equal(app.retries(), 1);
  for (const value of ['', '0', '-1', '3000abc', 'NaN', 'Infinity']) {
    app.render().setMaxPricePerSeat(value);
    assert.equal(app.render().isBudgetValid, false);
  }
  app.hooks.unmount();
});

test('closing for identity verification or the map preserves the current manual budget', t => {
  const app = editPricingApp(t);
  app.render(); app.ready(); app.settle(2000);
  app.render().setMaxPricePerSeat('3000');
  app.props.enabled = false;
  assert.equal(app.render().maxPricePerSeat, '3000');
  assert.equal(app.args(), skipToken);
  app.props.enabled = true;
  assert.equal(app.render().maxPricePerSeat, '3000');
  app.render().resetBudget();
  assert.equal(app.render().confirmedPricePerSeat, 2000);
  app.hooks.unmount();
});

test('closed editors and invalid seat counts never request a price', t => {
  const app = editPricingApp(t);
  app.props.enabled = false;
  app.render(); app.ready();
  assert.equal(app.args(), skipToken);
  app.props.enabled = true;
  for (const numberOfSeats of [0, -1, NaN, 1.5, Infinity]) {
    app.props.numberOfSeats = numberOfSeats;
    app.render(); app.ready();
    assert.equal(app.args(), skipToken);
  }
  app.hooks.unmount();
});

test('unmounting cancels the pricing debounce before it triggers a request', t => {
  const app = editPricingApp(t);
  app.render();
  app.hooks.unmount();
  t.mock.timers.tick(500);
  assert.equal(app.args(), skipToken);
});
