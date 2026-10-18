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
