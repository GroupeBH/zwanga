const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture() {
  const env = { active: true, params: { id: 'trip', bookingId: 'booking', section: 'passengers', openEdit: '1', track: 'true', ignored: 'secret-free-test' } };
  const { default: Screen } = loader({
    'expo-router': { Redirect: 'Redirect', useLocalSearchParams: () => env.params },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => env.active },
    '@/components/trip/DriverTripAccessGuard': { DriverTripAccessGuard: 'Guard' },
  })('app/trip/manage/[id].tsx');
  return { env, render() { const tree = Screen(); assert.equal(tree.type, 'Guard'); return tree.props.children.type(); } };
}

test('legacy management is an owner-guarded replacement, forwarding booking and edit context', () => {
  const f = fixture(), route = f.render();
  assert.equal(route.type, 'Redirect');
  assert.deepEqual(route.props.href, { pathname: '/trip/[id]', params: { id: 'trip', bookingId: 'booking',
    section: 'passengers', openEdit: '1', track: 'true' } });
});

test('covered or invalid legacy screens do not redirect the visible screen', () => {
  const f = fixture(); f.env.active = false; assert.equal(f.render(), null);
  f.env.active = true; f.env.params.id = ['trip']; assert.equal(f.render(), null);
});

test('legacy compatibility cannot mount the former management UI, controller, GPS or mutation hooks', () => {
  const source = fs.readFileSync('app/trip/manage/[id].tsx', 'utf8');
  assert.doesNotMatch(source, /useManageTripController|Gestion du trajet|ManageTripContent|ManageTripActionsFooter/);
});

test('canonical owner detail contains the shared scope, reservation modal and existing end-of-trip decision', () => {
  const source = fs.readFileSync('app/trip/[id].tsx', 'utf8');
  assert.match(source, /<RideOverlayScope scopeKey=\{`trip-detail:/);
  assert.match(source, /active=\{model.data.isScreenActive\}/);
  assert.match(source, /<DriverReservationModal workspace=\{workspace\}/);
  assert.match(source, /model.editing.edit.editTripModalVisible \|\| model.bookingState.mapModalVisible/);
  assert.match(source, /<NextRequestAfterTrip trip=\{model.data.trip\}/);
});
