const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { loader } = require('./helpers/loadTypeScript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(kind) {
  const state = { token: null }, sockets = [], options = [];
  class Socket extends EventEmitter {
    connected = false; sent = [];
    connect() { this.connected = true; this.emit('connect'); return this; }
    disconnect() { this.connected = false; this.emit('disconnect', 'client'); return this; }
    emit(name, data) { this.sent.push([name, data]); return super.emit(name, data); }
  }
  const load = loader({ '@/config/env': { API_BASE_URL: 'https://test.invalid/v1' },
    '@/services/tokenRefresh': { getValidAccessToken: async () => state.token, handle401Error: async () => false },
    'socket.io-client': { io: (_url, opts) => { options.push(opts); const socket = new Socket(); sockets.push(socket); return socket; } },
  });
  const client = load(`services/${kind}Socket.ts`)[`${kind}Socket`];
  const join = () => kind === 'chat' ? client.joinBookingRoom('owned') : client.joinTrip('owned');
  return { state, sockets, options, client, join, recovery: load('services/networkRecovery.ts') };
}
for (const kind of ['chat', 'tracking']) {
  test(`${kind}: explicit temporary server disconnect reconnects once and rejoins owned rooms`, async t => {
    t.mock.method(Math, 'random', () => 0);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(kind); f.state.token = 'synthetic'; await f.join();
    const socket = f.sockets[0];
    socket.sent.length = 0;
    socket.emit('server_restart', { reconnect: true, retryAfterSeconds: 5 });
    socket.emit('server_restart', { reconnect: true, retryAfterSeconds: 5 });
    socket.connected = false; socket.emit('disconnect', 'io server disconnect');
    t.mock.timers.tick(4999); await flush(); assert.equal(socket.connected, false);
    t.mock.timers.tick(1); await flush(); assert.equal(socket.connected, true);
    assert.equal(socket.sent.filter(([name]) => name.startsWith('join_')).length, 1);
    assert.equal(f.sockets.length, 1);
    f.client.disconnect();
  });
  test(`${kind}: logout or session revocation cancels scheduled recovery`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const revoked of [true, false]) {
      const f = fixture(kind); f.state.token = 'synthetic'; await f.join();
      const socket = f.sockets[0];
      socket.emit('server_restart', { reconnect: true, retryAfterSeconds: 5 });
      socket.connected = false;
      if (revoked) socket.emit('session_expired'); else f.client.disconnect();
      t.mock.timers.tick(60_000); await flush();
      assert.equal(socket.connected, false);
      f.client.disconnect();
    }
  });
  test(`${kind}: malformed restart hints do not restart a server-disconnected socket`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(kind); f.state.token = 'synthetic'; await f.join();
    const socket = f.sockets[0]; socket.connected = false;
    for (const value of [null, {}, { reconnect: 'true' }, { reconnect: false }]) socket.emit('server_restart', value);
    t.mock.timers.tick(60_000); await flush(); assert.equal(socket.connected, false);
    f.client.disconnect();
  });
  test(`${kind}: repeated dependency failures use a bounded retry burst`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const f = fixture(kind); f.state.token = 'synthetic'; await f.join();
    const socket = f.sockets[0];
    for (let attempt = 0; attempt < 6; attempt++) {
      socket.emit('server_restart', { reconnect: true, retryAfterSeconds: 5 });
      socket.connected = false; socket.emit('disconnect', 'io server disconnect');
      t.mock.timers.tick(61_000); await flush();
      assert.equal(socket.connected, attempt < 5);
    }
    f.client.disconnect();
  });
  test(`${kind}: no socket without token, recovery retains the room and caps reconnects`, async () => {
    const f = fixture(kind); await assert.rejects(f.join(), /session/);
    assert.equal(f.sockets.length, 0);
    f.state.token = 'synthetic'; f.recovery.notifyConnectionRecovery(); await flush();
    assert.equal(f.sockets.length, 1); assert.equal(f.sockets[0].connected, true);
    assert.equal(f.options[0].reconnectionAttempts, 5); assert.equal(f.options[0].timeout, 8000);
    assert.ok(f.sockets[0].sent.some(([name, value]) => name.startsWith('join_') && Object.values(value).includes('owned')));
    f.state.token = null; f.client.refreshAuthentication(); await flush();
    assert.equal(f.sockets[0].connected, false);
    f.client.disconnect(); f.state.token = 'new-session'; f.recovery.notifyConnectionRecovery(); await flush();
    assert.equal(f.sockets.length, 1, 'logout removes recovery listeners');
  });
}
