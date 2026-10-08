const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { estimateCashCommission } = loader()('utils/cashCommission.ts');
const finance = (debt, funds = 0) => ({ commissionRate: 0.05, cash: {
  enabled: true, availableTokens: funds, availableCreditTokens: 25, debtLimitTokens: 25,
  debtTokens: debt, moneyPerToken: 100, blocked: false,
} });

test('remaining credit is capped against total debt even if the summary overstates credit', () => {
  assert.equal(estimateCashCommission(finance(20), 10000).allowed, true);
  assert.equal(estimateCashCommission(finance(20), 10000).totalDebt, 25);
  assert.equal(estimateCashCommission(finance(20.01), 10000).allowed, false);
  assert.equal(estimateCashCommission(finance(25), 20).allowed, false);
  assert.equal(estimateCashCommission(finance(25, 5), 10000).allowed, true);
  assert.equal(estimateCashCommission(finance(25.01, 100), 10000).allowed, false);
});

test('publication removes a selected cash mode after price, seats or debt invalidate it', () => {
  const hooks = hookHarness();
  const response = { currentData: finance(20), isFetching: false, isError: false };
  const props = { value: ['points','cash'], price: 10000, seats: 1, onChange: fn => { props.value = fn(props.value); } };
  const Component = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: x => x } },
    'expo-router': { useRouter: () => ({ push() {} }) }, '@/store/hooks': { useAppSelector: () => ({ id: 'driver' }) }, '@/store/selectors': {},
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => response },
  })('features/publish/PublishPaymentModes.tsx').PublishPaymentModes;
  const render = () => hooks.render(() => Component(props));
  render(); assert.deepEqual(props.value, ['points','cash']);
  props.price = 10020; render(); assert.deepEqual(props.value, ['points']);
  props.price = 10000; props.value = ['cash']; props.seats = 2;
  render(); assert.deepEqual(props.value, [], 'do not silently enable a different payment mode');
  props.seats = 1; props.value = ['points','cash']; response.currentData = finance(26);
  render(); assert.deepEqual(props.value, ['points']);
  hooks.unmount();
});

for (const recurring of [false, true]) {
  for (const [debt, allowed] of [[20, true], [20.01, false], [26, false]]) {
    test(`${recurring ? 'recurring' : 'single'} submission rechecks fresh debt ${debt} before publishing`, async () => {
      const calls = [], dialogs = [], successes = [];
      const { usePublishSubmission } = loader({
        '../../features/publish/publishModel': { getLocationCoordinates: () => [15,-4], isUserDriver: () => true },
        '@/services/analytics': { trackEvent() {} },
      })('hooks/publish/usePublishSubmission.ts');
      const create = payload => { calls.push(payload); return { unwrap: async () => ({ id: 'trip' }) }; };
      let refreshes = 0;
      const props = { acceptedPaymentModes: ['cash'], refreshDriverFinance: async () => { refreshes++; return finance(debt); },
        publishInFlightRef: { current: false }, isSubmittingTrip: false, hasDepartureAddress: true, hasArrivalAddress: true,
        seats: '1', price: '10000', departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true,
        selectedVehicleId: 'vehicle', isPublishIdentityVerified: true, isRecurringTrip: recurring, recurringWeekdays: [1],
        departureAddress: 'Start', arrivalAddress: 'End', departureReference: '', arrivalReference: '', description: '',
        formatDateOnlyValue: () => '2030-01-01', formatTimeOnlyValue: () => '12:00',
        createTrip: create, createRecurringTrip: create, showDialog: d => dialogs.push(d),
        setPublicationSuccess: s => successes.push(s),
        getMyTrips: () => { throw new Error('No write to reconcile'); }, getMyRecurringTrips: () => { throw new Error('No write to reconcile'); },
      };
      await usePublishSubmission(props).handlePublish();
      assert.equal(refreshes, 1); assert.equal(calls.length, allowed ? 1 : 0);
      assert.equal(successes.length, allowed ? 1 : 0);
      assert.equal(props.publishInFlightRef.current, false);
      if (!allowed) assert.equal(dialogs[0].title, 'Cash indisponible');
      props.refreshDriverFinance = async () => { throw new Error('offline'); };
      calls.length = 0; successes.length = 0; dialogs.length = 0;
      await usePublishSubmission(props).handlePublish();
      assert.equal(calls.length, 0); assert.equal(successes.length, 0);
      assert.equal(dialogs[0].title, 'Vérification du cash indisponible');
      assert.equal(props.publishInFlightRef.current, false);
    });
  }
}
