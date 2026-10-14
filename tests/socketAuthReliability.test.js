const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture() {
  const state = { token: null, refreshes: 0 }, sockets = [];
  class Socket extends EventEmitter {
    connected = false; opening = false; auth = {}; handshakes = []; sent = [];
    connect() {
      if (this.connected || this.opening) return this;
      this.opening = true;
      this.auth(payload => {
        if (!this.opening) return;
        this.handshakes.push(payload); this.opening = false; this.connected = true;
        super.emit('connect');
      });
      return this;
    }
    emit(event, ...args) { this.sent.push({ event, args }); return super.emit(event, ...args); }
    disconnect() {
      const wasOpen = this.connected || this.opening;
      this.connected = false; this.opening = false;
      if (wasOpen) super.emit('disconnect', 'client disconnect');
      return this;
    }
  }
  const load = loader({
    '@/config/env': { API_BASE_URL: 'https://example.invalid/v1' },
    '@/services/tokenRefresh': { getValidAccessToken: async () => state.token,
      handle401Error: async () => { state.refreshes++; return false; } },
    'socket.io-client': { io: (url, options) => {
      const socket = new Socket(); socket.options = options; socket.url = url; sockets.push(socket); return socket;
    } },
  });
  return { state, sockets, load };
}

for (const kind of ['chat', 'tracking']) {
  const modulePath = `services/${kind}Socket.ts`;
  const join = (client, id) => kind === 'chat' ? client.joinBookingRoom(id) : client.joinTrip(id);
  test(`${kind}: no socket without token; retained subscription resumes with bounded reconnect settings`, async () => {
    const e = fixture(), client = e.load(modulePath)[`${kind}Socket`];
    await assert.rejects(join(client, 'synthetic-id'), /session valide/);
    assert.equal(e.sockets.length, 0);
    e.state.token = 'synthetic-valid';
    client.refreshAuthentication(); await tick();
    assert.equal(e.sockets.length, 1);
    const socket = e.sockets[0];
    assert.equal(socket.options.reconnectionAttempts, 5);
    assert.equal(socket.options.timeout, 8000);
    assert.deepEqual(socket.handshakes, [{ token: 'synthetic-valid' }]);
    assert.ok(socket.sent.some(item => item.event === (kind === 'chat' ? 'join_booking' : 'join_trip')));
    client.disconnect();
    client.resumeConnection(); await tick();
    assert.equal(socket.connected, false);
    assert.equal(e.sockets.length, 1, 'recovery cannot resurrect released subscriptions');
  });

  test(`${kind}: every automatic handshake rereads credentials and stops if they expire`, async () => {
    const e = fixture(), client = e.load(modulePath)[`${kind}Socket`];
    e.state.token = 'first-valid';
    await join(client, 'id'); await tick();
    const socket = e.sockets[0];
    e.state.token = 'rotated-valid';
    socket.disconnect().connect(); await tick();
    assert.deepEqual(socket.handshakes.at(-1), { token: 'rotated-valid' });
    e.state.token = null;
    socket.disconnect().connect(); await tick();
    assert.equal(socket.connected, false);
    assert.equal(socket.handshakes.length, 2);
    client.refreshAuthentication(); await tick();
    assert.equal(socket.connected, false);
    e.state.token = 'recovered';
    client.resumeConnection(); await tick();
    assert.equal(socket.connected, true);
    assert.equal(socket.handshakes.at(-1).token, 'recovered');
    socket.emit('session_expired'); await tick();
    assert.equal(socket.connected, false);
    assert.equal(e.state.refreshes, 1);
    client.disconnect();
  });

  test(`${kind}: network recovery before any consumer does not open a socket`, async () => {
    const e = fixture(), client = e.load(modulePath)[`${kind}Socket`];
    e.state.token = 'valid'; client.resumeConnection(); client.refreshAuthentication(); await tick();
    assert.equal(e.sockets.length, 0);
  });
}

test('late handshake from a replaced connection or account is ignored', async () => {
  const pending = [], replies = [];
  let generation = 0, current = true, disconnects = 0;
  const { bindSocketAuthentication } = loader({
    '@/services/tokenRefresh': { getValidAccessToken: () => { const gate = deferred(); pending.push(gate); return gate.promise; } },
    './tokenSession': { getTokenSessionVersion: () => generation },
  })('services/socketAuthPolicy.ts');
  const socket = new EventEmitter(); socket.disconnect = () => { disconnects++; };
  bindSocketAuthentication(socket, () => current);
  socket.auth(value => replies.push(value)); socket.auth(value => replies.push(value));
  pending[0].resolve('old'); pending[1].resolve('latest'); await tick();
  assert.deepEqual(replies, [{ token: 'latest' }]);
  socket.auth(value => replies.push(value)); generation++;
  pending[2].resolve('other-session'); await tick();
  assert.equal(replies.length, 1); assert.equal(disconnects, 1);
  socket.auth(value => replies.push(value)); current = false;
  pending[3].resolve('released'); await tick();
  assert.equal(replies.length, 1);
});

test('network/foreground recovery coalesces refreshes and ignores a changed session', async () => {
  const pending = [], resumed = [];
  let version = 0, subscribed = false;
  const { recoverSocketConnections } = loader({
    './tokenSession': { getTokenSessionVersion: () => version },
    './tokenRefresh': { proactiveTokenRefresh: () => { const gate = deferred(); pending.push(gate); return gate.promise; } },
    './chatSocket': { chatSocket: { hasActiveSubscriptions: () => subscribed, resumeConnection: () => resumed.push('chat') } },
    './trackingSocket': { trackingSocket: { hasActiveSubscriptions: () => false, resumeConnection: () => resumed.push('tracking') } },
  })('services/socketRecovery.ts');
  await recoverSocketConnections(); assert.equal(pending.length, 0);
  subscribed = true;
  const first = recoverSocketConnections();
  assert.equal(recoverSocketConnections(), first);
  assert.equal(pending.length, 1);
  pending[0].resolve(true); await first;
  assert.deepEqual(resumed, ['chat', 'tracking']);
  const next = recoverSocketConnections(); version++;
  pending[1].resolve(true); await next;
  assert.equal(resumed.length, 2);
});
