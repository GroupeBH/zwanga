const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { parseRideRealtimeEvent } = loader()('features/notifications/rideRealtime.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const incoming = { kind: 'incoming', recipientId: id(1), eventId: id(2), data: {
  actionProtocol: 'driver-v1', type: 'driver_dispatch_offer', driverId: id(1), passengerId: id(3),
  offerId: id(4), tripRequestId: id(5), expiresAt: new Date(Date.now() + 20000).toISOString(),
} };
test('socket envelopes validate recipients, ids and invitation ownership before dispatch', () => {
  assert.equal(parseRideRealtimeEvent(incoming).kind, 'incoming');
  for (const raw of [null, [], { ...incoming, recipientId: id(9) }, { ...incoming, eventId: '../../auth' },
    { ...incoming, data: { ...incoming.data, passengerId: id(1) } }, { kind: 'changed', recipientId: id(1) }])
    assert.equal(parseRideRealtimeEvent(raw), null);
});
test('foreground subscription coalesces refresh, ignores foreign sessions and releases when backgrounded', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); const state = { active: true, session: 0 }; let receive;
  const displayed = [], dismissed = [], invalidated = []; let stops = 0;
  const { useRideRealtime } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.active },
    '@/store/hooks': { useAppDispatch: () => tags => invalidated.push(tags) },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => tags } } },
    '@/services/chatSocket': { chatSocket: { subscribeToRideAlerts: fn => { receive = fn; return () => { stops++; }; } } },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.session },
    '@/services/driverNotifications': { displayDriverInvitation: async data => displayed.push(data), dismissDriverInvitation: async data => dismissed.push(data) },
    '@/services/rideAlertSession': { pendingRideAlertHandoffs: () => [],
      pendingRideAlerts: () => [{ kind: 'dispatch', key: 'dispatch', id: id(4), recipientId: id(1), data: incoming.data }] },
    '@/services/rideAudioDiagnostics': { reportRideAudioFailure() {} },
  })('hooks/notifications/useRideRealtime.ts');
  hooks.render(() => useRideRealtime(id(1), true));
  receive(incoming); receive({ kind: 'reconnected' }); receive({ ...incoming, recipientId: id(9) });
  assert.equal(displayed.length, 1); t.mock.timers.tick(1000); assert.equal(invalidated.length, 1);
  for (let i = 0; i < 20; i++) { receive(incoming); t.mock.timers.tick(250); }
  assert.equal(displayed.length, 1); assert.equal(invalidated.length, 1, 'same event is not reloaded every 250 ms');
  receive({ kind: 'changed', recipientId: id(1), requestId: id(5), terminal: true });
  assert.equal(dismissed.length, 1);
  state.session++; receive(incoming); assert.equal(displayed.length, 1);
  state.active = false; hooks.render(() => useRideRealtime(id(1), true));
  assert.equal(stops, 1); hooks.unmount();
});

test('normal realtime changes target the affected details and lists, reconnect refreshes all activity', () => {
  const { rideRealtimeTags } = loader()('features/notifications/rideRealtimeRefresh.ts');
  const tags = rideRealtimeTags({ kind: 'changed', recipientId: id(1), requestId: id(5), terminal: true });
  assert(tags.some(tag => tag.type === 'TripRequest' && tag.id === id(5)));
  assert(tags.some(tag => tag.type === 'MyTripRequests' && tag.id === 'LIST'));
  assert(!tags.some(tag => tag.type === 'Booking' || tag.type === 'TripRequest' && !tag.id));
  assert(rideRealtimeTags({ kind: 'reconnected' }).some(tag => tag.type === 'Booking' && !tag.id));
});

test('server cancellation clears a staged handoff before its native callback can resume sound', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(); let receive, session;
  const load = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    '@/store/hooks': { useAppDispatch: () => () => {} },
    '@/store/api/baseApi': { baseApi: { util: { invalidateTags: tags => tags } } },
    '@/services/chatSocket': { chatSocket: { subscribeToRideAlerts: fn => { receive = fn; return () => {}; } } },
    '@/services/driverNotifications': { dismissDriverInvitation: async target => {
      session.acknowledgeRideAlerts(alert => alert.kind === target.kind && alert.id === target.id);
    } },
  });
  session = load('services/rideAlertSession.ts');
  const parse = load('features/notifications/rideAlert.ts').parseRideAlert;
  const useRealtime = load('hooks/notifications/useRideRealtime.ts').useRideRealtime;
  hooks.render(() => useRealtime(id(1), true));
  for (const data of [
    { type: 'trip_request_nearby', driverId: id(1), tripRequestId: id(5), ringAlert: 'nearby-request-v1' },
    { type: 'new_booking', driverId: id(1), bookingId: id(6), actionProtocol: 'driver-v1' },
  ]) {
    const handoff = session.beginRideAlertHandoff(parse({ ...data, ringUntil: new Date(Date.now() + 30000).toISOString() }));
    assert.ok(handoff);
    receive({ kind: 'changed', recipientId: id(1), requestId: data.tripRequestId, bookingId: data.bookingId, terminal: true });
    session.completeRideAlertHandoff(handoff);
    assert.deepEqual(session.pendingRideAlerts(id(1)), []);
    assert.deepEqual(session.pendingRideAlertHandoffs(id(1)), []);
  }
  hooks.unmount();
});
