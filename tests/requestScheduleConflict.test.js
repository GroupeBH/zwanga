const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { driverScheduleConflictDialog } = loader()('features/request-detail/scheduleConflict.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const conflict = { kind: 'trip', id: id(2), driverId: id(1), departure: 'Départ de test',
  arrival: 'Arrivée de test', departureDate: '2099-01-02T14:00:00Z', status: 'upcoming' };
const error = value => ({ status: 409, data: { code: 'DRIVER_SCHEDULE_CONFLICT', conflict: value } });

test('schedule conflict names the route and departure, with direct navigation but no automatic action', () => {
  const routes = [], dialog = driverScheduleConflictDialog(error(conflict), id(1), href => routes.push(href));
  assert.equal(dialog.variant, 'warning');
  assert.match(dialog.message, /Départ de test/); assert.match(dialog.message, /Arrivée de test/);
  assert.match(dialog.message, /2099/); assert.equal(dialog.actions[0].label, 'Rester ici');
  assert.deepEqual(routes, []); dialog.actions[1].onPress();
  assert.deepEqual(routes, [{ pathname: '/trip/manage/[id]', params: { id: id(2) } }]);
});

test('ongoing trips open their navigation and accepted requests without a trip open their details', () => {
  for (const [value, route] of [[{ ...conflict, status: 'ongoing' }, '/trip/navigate/[id]'],
    [{ ...conflict, kind: 'request', status: 'driver_selected' }, '/request-details/[id]'],
    [{ ...conflict, kind: 'request', status: 'preparing' }, '/request-details/[id]']]) {
    const routes = [], dialog = driverScheduleConflictDialog(error(value), id(1), href => routes.push(href));
    dialog.actions[1].onPress(); assert.equal(routes[0].pathname, route);
    if (value.status === 'ongoing') assert.match(dialog.title, /en cours/);
  }
});

test('missing, malformed and foreign details fall back safely without disclosing another driver schedule', () => {
  for (const value of [undefined, null, {}, { ...conflict, id: '../../auth' },
    { ...conflict, driverId: id(3) }, { ...conflict, departureDate: 'bad date' }, { ...conflict, kind: 'other' }]) {
    const routes = [], dialog = driverScheduleConflictDialog(error(value), id(1), href => routes.push(href));
    assert.doesNotMatch(dialog.message, /Départ de test/);
    dialog.actions[1].onPress(); assert.deepEqual(routes, ['/(tabs)/trips']);
  }
});

test('unrelated failures are not turned into schedule conflicts', () => {
  for (const cause of [null, undefined, new Error('offline'), { data: { code: 'FORBIDDEN', conflict } }])
    assert.equal(driverScheduleConflictDialog(cause, id(1), () => assert.fail()), null);
});

test('long place names stay bounded in the dialog; details remain available via the trip link', () => {
  const dialog = driverScheduleConflictDialog(error({ ...conflict, departure: 'Lieu\n'.repeat(100) }), id(1), () => {});
  assert.match(dialog.message, /…/);
  assert.ok(dialog.message.length < 400);
  assert.equal(dialog.actions[1].label, 'Voir ce trajet');
});

test('a dialog action from an old session cannot navigate into another account', () => {
  let session = 1;
  const build = loader({ '@/services/tokenSession': { getTokenSessionVersion: () => session } })
    ('features/request-detail/scheduleConflict.ts').driverScheduleConflictDialog;
  const dialog = build(error(conflict), id(1), () => assert.fail('stale navigation'));
  session++; dialog.actions[1].onPress();
});

test('shared-trip consent remains required and common API error envelopes are supported', () => {
  for (const wrap of [body => body, body => ({ data: body }), body => ({ data: { error: body } })]) {
    const dialog = driverScheduleConflictDialog(wrap({ code: 'SHARED_TRIP_OFFER_REQUIRED',
      conflict: { ...conflict, status: 'ongoing' } }), id(1), () => {});
    assert.match(dialog.message, /accord du passager/);
  }
});
