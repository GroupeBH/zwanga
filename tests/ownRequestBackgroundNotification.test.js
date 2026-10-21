const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';

function fixture() {
  let task;
  const displayed = [], fallback = [];
  loader({
    'expo-constants': { appOwnership: 'standalone' },
    'expo-notifications': {},
    'expo-task-manager': { defineTask: (_name, handler) => { task = handler; } },
    './driverNotifications': { displayDriverInvitation: async data => displayed.push(data) },
    './pushNotifications': { handleIncomingNotification: async notification => fallback.push(notification) },
  })('services/backgroundNotificationTask.ts');
  return { displayed, fallback, deliver: data => task({ data: { notification: {
    request: { identifier: 'notice', content: { data } },
  } } }) };
}

test('headless self requests cannot fall through to a generic notification after parser rejection', async () => {
  const f = fixture();
  for (const data of [
    { type: 'trip_request_nearby', ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3', tripRequestId: id },
    { type: 'driver_dispatch_offer', actionProtocol: 'driver-v1', offerId: id, expiresAt: new Date(Date.now() + 30000).toISOString() },
    { type: 'new_trip_request', tripRequestId: id },
  ]) await f.deliver({ ...data, driverId, passengerId: driverId });
  assert.deepEqual(f.displayed, []); assert.deepEqual(f.fallback, []);
});

test('another passenger still rings and responses to the author keep their remote transport', async () => {
  const f = fixture();
  await f.deliver({ type: 'driver_dispatch_offer', actionProtocol: 'driver-v1', offerId: id,
    driverId, passengerId: id, expiresAt: new Date(Date.now() + 30000).toISOString() });
  assert.equal(f.displayed.length, 1);
  await f.deliver({ type: 'trip_request_accepted', ringAlert: 'request-accepted-v1', passengerId: driverId, tripRequestId: id });
  assert.equal(f.displayed.length, 1); assert.deepEqual(f.fallback, []);
});
