const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { readDriverPushData } = load('features/notifications/driverInvitation.ts');
const { isRemoteRequestAcceptanceAlert } = load('features/notifications/rideSound.ts');
const data = { type: 'trip_request_accepted', tripRequestId: 'synthetic-request', ringAlert: 'request-accepted-v1' };

test('acceptance alert is recognized in each Expo envelope without becoming a driver invitation', () => {
  for (const envelope of [data, { data }, { data: { dataString: JSON.stringify(data) } },
    { notification: { request: { content: { data } } } }]) {
    const parsed = readDriverPushData(envelope);
    assert.equal(isRemoteRequestAcceptanceAlert(parsed), true);
    assert.equal(load('features/notifications/driverInvitation.ts').parseDriverInvitation(parsed), null);
  }
  for (const invalid of [undefined, {}, { ...data, type: 'message' }, { ...data, ringAlert: undefined }])
    assert.equal(isRemoteRequestAcceptanceAlert(invalid), false);
});

test('background task does not replay the remote acceptance on the default channel', async () => {
  let task; const calls = [];
  loader({
    'expo-constants': { __esModule: true, default: { appOwnership: 'standalone' } },
    'expo-notifications': {},
    'expo-task-manager': { defineTask: (_name, handler) => { task = handler; } },
    './pushNotifications': { handleIncomingNotification: async () => calls.push('standard') },
    './driverNotifications': { displayDriverInvitation: async () => calls.push('driver') },
  })('services/backgroundNotificationTask.ts');
  await task({ data: { notification: { request: { content: { title: 'Acceptée', data } } } } });
  await task({ data: { data: { dataString: JSON.stringify(data) } } });
  assert.deepEqual(calls, []);
  await task({ data: { notification: { request: { content: { title: 'Message', data: { type: 'message' } } } } } });
  assert.deepEqual(calls, ['standard']);
});

test('acceptance opens the request or created trip without an accept/decline action', () => {
  const { getNotificationHref } = load('utils/notificationNavigation.ts');
  assert.deepEqual(getNotificationHref(data), { pathname: '/request-details/[id]', params: { id: 'synthetic-request' } });
  assert.equal(getNotificationHref({ ...data, tripId: 'synthetic-trip' }), '/trip/synthetic-trip');
});
