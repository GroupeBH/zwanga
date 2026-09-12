const test = require('node:test');
const assert = require('node:assert/strict');
const babel = require('@babel/core');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('route cache bounds memory, expires entries and retains recently used routes', () => {
  const { BoundedCache } = loader()('utils/boundedCache.ts');
  let now = 100;
  const cache = new BoundedCache(2, () => now);
  cache.set('a', 1, 100);
  cache.set('b', 2, 100);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3, 100);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.size, 2);
  now = 200;
  assert.equal(cache.get('a'), undefined);
  cache.set('d', 4, 100);
  assert.equal(cache.size, 1);
  cache.clear();
  assert.equal(cache.size, 0);
  const empty = new BoundedCache(0);
  empty.set('x', 1, 100);
  assert.equal(empty.size, 0);
});

test('preview queue caps concurrency, cancels obsolete queued work and recovers from failures', async () => {
  const { TaskQueue } = loader()('utils/taskQueue.ts');
  const queue = new TaskQueue(2, 2);
  const a = deferred(), b = deferred();
  const signal = new AbortController().signal;
  let running = 0, max = 0, obsoleteRan = false;
  const work = (item) => async () => { running++; max = Math.max(max, running); try { return await item.promise; } finally { running--; } };
  const first = queue.run(work(a), signal);
  const second = queue.run(work(b), signal);
  const obsolete = new AbortController();
  const cancelled = queue.run(async () => { obsoleteRan = true; }, obsolete.signal);
  const cancelCheck = assert.rejects(cancelled, { name: 'AbortError' });
  obsolete.abort();
  const fourth = queue.run(async () => 4, signal);
  a.resolve(1); b.resolve(2);
  assert.deepEqual(await Promise.all([first, second, fourth]), [1, 2, 4]);
  await cancelCheck;
  assert.equal(max, 2);
  assert.equal(obsoleteRan, false);
  await assert.rejects(queue.run(async () => { throw new Error('offline'); }, signal), /offline/);
  assert.equal(await queue.run(async () => 5, signal), 5);
});

test('production logging preserves side effects, spread arguments, local console and error diagnostics', () => {
  const plugin = require('../scripts/babel-production-logs');
  const source = `
    const results = [];
    function value() { results.push('evaluated'); return 1; }
    function* items() { results.push('spread'); yield 2; }
    console.log('noise', value()); console.debug(...items()); console.info('noise');
    console.warn('warning'); console.error('error');
    function local(console) { console.log('local'); }
    local({ log: value }); return results;
  `;
  const code = babel.transformSync(source, { configFile: false, babelrc: false, parserOpts: { allowReturnOutsideFunction: true }, plugins: [plugin] }).code;
  const logged = [];
  const results = new Function('console', code)({ log() { throw new Error('log not stripped'); }, debug() { throw new Error('debug not stripped'); }, info() { throw new Error('info not stripped'); }, warn: (v) => logged.push(v), error: (v) => logged.push(v) });
  assert.deepEqual(results, ['evaluated', 'spread', 'evaluated']);
  assert.deepEqual(logged, ['warning', 'error']);
});

test('native RTK listeners emit only transitions and ignore late network results after cleanup', async () => {
  const initial = deferred();
  let appListener, networkListener, removed = 0;
  const AppState = { currentState: 'active', addEventListener: (_event, fn) => { appListener = fn; return { remove: () => removed++ }; } };
  const network = { getNetworkStateAsync: () => initial.promise, addNetworkStateListener: (fn) => { networkListener = fn; return { remove: () => removed++ }; } };
  const { nativeQueryListeners } = loader({ 'react-native': { AppState }, 'expo-network': network })('services/nativeQueryListeners.ts');
  const events = [];
  const actions = Object.fromEntries(['onFocus', 'onFocusLost', 'onOnline', 'onOffline'].map((name) => [name, () => name]));
  const stop = nativeQueryListeners((event) => events.push(event), actions);
  networkListener({ isConnected: false }); networkListener({ isConnected: false });
  initial.resolve({ isConnected: true }); await tick();
  assert.deepEqual(events, ['onOffline']);
  AppState.currentState = 'background'; appListener(); appListener();
  AppState.currentState = 'active'; appListener(); await tick();
  assert.deepEqual(events, ['onOffline', 'onFocusLost', 'onFocus', 'onOnline']);
  stop(); networkListener({ isConnected: false });
  assert.equal(removed, 2);
  assert.equal(events.length, 4);
});

test('photo preparation caps both orientations without upscaling/cropping and releases native buffers', async () => {
  let resized, released = 0;
  const image = { saveAsync: async () => ({ uri: 'file:///prepared.jpg' }), release: () => released++ };
  const context = { resize: (size) => { resized = size; }, renderAsync: async () => image, release: () => released++ };
  const { prepareProfilePhoto, getProfilePhotoSize, chooseProfilePictureSize } = loader({
    'react-native': { Image: { getSize: async () => ({ width: 4000, height: 3000 }) } },
    'expo-image-manipulator': { ImageManipulator: { manipulate: () => context }, SaveFormat: { JPEG: 'jpeg' } },
  })('utils/profilePhoto.ts');
  assert.deepEqual(getProfilePhotoSize(3000, 4000), { width: 768, height: 1024 });
  assert.equal(chooseProfilePictureSize(['4000x3000', '640x480', '1920x1080']), '1920x1080');
  assert.equal(chooseProfilePictureSize(['4000x3000', '3000x2000']), '3000x2000');
  assert.equal(chooseProfilePictureSize(['High']), undefined);
  assert.deepEqual(getProfilePhotoSize(100, 200), { width: 100, height: 200 });
  assert.throws(() => getProfilePhotoSize(0, 100));
  assert.equal(await prepareProfilePhoto('file:///original.jpg'), 'file:///prepared.jpg');
  assert.deepEqual(resized, { width: 1024, height: 768 });
  assert.equal(released, 2);
  image.saveAsync = async () => { throw new Error('disk full'); };
  await assert.rejects(prepareProfilePhoto('file:///original.jpg'), /disk full/);
  assert.equal(released, 4);
});

test('foreground hooks share one native subscription and clean it after the last consumer', () => {
  let callbacks, subscribed = 0, removed = 0, notifications = 0;
  const { subscribeAppActivity } = loader({ 'react-native': { AppState: {
    addEventListener: (_event, fn) => { callbacks = fn; subscribed++; return { remove: () => removed++ }; },
  } } })('services/appActivity.ts');
  const first = subscribeAppActivity(() => notifications++);
  const second = subscribeAppActivity(() => notifications++);
  assert.equal(subscribed, 1);
  callbacks(); assert.equal(notifications, 2);
  first(); assert.equal(removed, 0);
  callbacks(); assert.equal(notifications, 3);
  second(); assert.equal(removed, 1);
});

function socketFixture(tokens = async () => 'token', initiallyOffline = false) {
  const sockets = [];
  class Socket {
    connected = false; handlers = new Map(); emitted = []; auth = {}; acknowledgement = { success: true }; offline = initiallyOffline;
    on(event, fn) { const list = this.handlers.get(event) ?? []; list.push(fn); this.handlers.set(event, list); return this; }
    once(event, fn) { const wrapper = (...args) => { this.off(event, wrapper); fn(...args); }; return this.on(event, wrapper); }
    off(event, fn) { this.handlers.set(event, (this.handlers.get(event) ?? []).filter((item) => item !== fn)); return this; }
    fire(event, ...args) { [...(this.handlers.get(event) ?? [])].forEach((fn) => fn(...args)); }
    connect() { if (this.offline) { this.fire('connect_error', new Error('offline')); return this; } if (!this.connected) { this.connected = true; this.fire('connect'); } return this; }
    disconnect() { const wasConnected = this.connected; this.connected = false; if (wasConnected) this.fire('disconnect', 'client disconnect'); return this; }
    removeAllListeners() { this.handlers.clear(); }
    timeout() { return this; }
    emit(event, data, callback) { this.emitted.push({ event, data }); callback?.(null, this.acknowledgement); return this; }
  }
  const load = loader({ '@/config/env': { API_BASE_URL: 'https://example.test/api/v1' }, '@/services/tokenRefresh': { getValidAccessToken: tokens }, 'socket.io-client': { io: (url) => { assert.ok(!url.includes('/api/v1')); const socket = new Socket(); sockets.push(socket); return socket; } } });
  return { sockets, load };
}

test('chat shares one socket, retains other room subscribers and reconnects with the same manager', async () => {
  const { sockets, load } = socketFixture();
  const chat = load('services/chatSocket.ts').chatSocket;
  await Promise.all([chat.joinBookingRoom('booking'), chat.joinBookingRoom('booking')]);
  assert.equal(sockets.length, 1);
  sockets[0].disconnect();
  await chat.requestBookingMessages('booking');
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].connected, true);
  await chat.leaveBookingRoom('booking');
  assert.equal(sockets[0].connected, true);
  await chat.leaveBookingRoom('booking');
  assert.equal(sockets[0].connected, false);
});

test('a late chat connection cannot remove rooms belonging to a new authenticated session', async () => {
  const old = deferred(); let calls = 0;
  const { sockets, load } = socketFixture(() => ++calls === 1 ? old.promise : Promise.resolve('new-token'));
  const chat = load('services/chatSocket.ts').chatSocket;
  const pending = chat.joinBookingRoom('booking');
  const rejection = assert.rejects(pending, /fermée/);
  chat.disconnect();
  await chat.joinBookingRoom('booking');
  old.resolve('old-token');
  await rejection;
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].auth.token, 'new-token');
  assert.equal(sockets[0].connected, true);
  await chat.leaveBookingRoom('booking');
  assert.equal(sockets[0].connected, false);
});

test('tracking keeps one connection and suppresses only acknowledged passenger positions', async () => {
  const { sockets, load } = socketFixture();
  const tracking = load('services/trackingSocket.ts').trackingSocket;
  await Promise.all([tracking.joinTrip('trip'), tracking.joinTrip('trip')]);
  assert.equal(sockets.length, 1);
  sockets[0].acknowledgement = { success: false };
  await assert.rejects(tracking.updatePassengerLocation('trip', 'booking', [15, -4]));
  sockets[0].acknowledgement = { success: true };
  await tracking.updatePassengerLocation('trip', 'booking', [15, -4]);
  await tracking.updatePassengerLocation('trip', 'booking', [15, -4]);
  assert.equal(sockets[0].emitted.filter((item) => item.event === 'passenger_location_update').length, 2);
  tracking.disconnect();
  assert.equal(sockets[0].connected, false);
});

test('delivery deduplication never doubles the foreground GPS update interval', (t) => {
  let now = 10000;
  t.mock.method(Date, 'now', () => now);
  const { recordLocationDelivery, wasLocationDeliveredRecently, clearLocationDeliveries } = loader()('services/locationDelivery.ts');
  recordLocationDelivery('passenger:booking', 'socket');
  assert.equal(wasLocationDeliveredRecently('passenger:booking', 6000, 'rest'), true);
  now += 5000;
  assert.equal(wasLocationDeliveredRecently('passenger:booking', 6000, 'socket'), false);
  assert.equal(wasLocationDeliveredRecently('passenger:booking', 6000, 'rest'), true);
  clearLocationDeliveries();
  assert.equal(wasLocationDeliveredRecently('passenger:booking', 6000, 'rest'), false);
});

test('tracking recovers rooms and connected state after the first connection failed', async () => {
  const { sockets, load } = socketFixture(async () => 'token', true);
  const tracking = load('services/trackingSocket.ts').trackingSocket;
  const states = [];
  const stop = tracking.subscribeToConnectionState((state) => states.push(state));
  await assert.rejects(tracking.joinTrip('trip'), /offline/);
  assert.equal(sockets.length, 1);
  sockets[0].offline = false;
  sockets[0].connect();
  assert.equal(states.at(-1), true);
  assert.equal(sockets[0].emitted.filter((item) => item.event === 'join_trip' && item.data.tripId === 'trip').length, 1);
  await tracking.leaveTrip('trip');
  sockets[0].emitted = [];
  sockets[0].disconnect().connect();
  assert.equal(sockets[0].emitted.some((item) => item.event === 'join_trip'), false);
  stop(); tracking.disconnect();
});

test('an unacknowledged passenger socket emission never suppresses the REST fallback', async () => {
  const { sockets, load } = socketFixture();
  const tracking = load('services/trackingSocket.ts').trackingSocket;
  const { wasLocationDeliveredRecently } = load('services/locationDelivery.ts');
  await tracking.joinTrip('trip');
  sockets[0].acknowledgement = undefined;
  await tracking.updatePassengerLocation('trip', 'booking', [15, -4]);
  assert.equal(wasLocationDeliveredRecently('passenger:booking', 6000, 'rest'), false);
  tracking.disconnect();
});

test('queue refuses extra pending reads without blocking later work', async () => {
  const { TaskQueue } = loader()('utils/taskQueue.ts');
  const queue = new TaskQueue(1, 1), gate = deferred();
  const signal = new AbortController().signal;
  const first = queue.run(() => gate.promise, signal);
  const second = queue.run(async () => 2, signal);
  await assert.rejects(queue.run(async () => 3, signal), /complète/);
  gate.resolve(1);
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
});

test('startup uses valid local tokens without a network refresh', async () => {
  let requests = 0;
  const { validateAndRefreshTokens } = loader({
    '../store/api/authRefreshApi': { authRefreshApi: {} },
    '../store/storeAccessor': { getStoreDispatch: () => () => { requests++; throw new Error('unexpected network'); } },
    '../utils/jwt': { isTokenExpired: () => false },
    './tokenStorage': { getTokens: async () => ({ accessToken: 'access', refreshToken: 'refresh' }) },
  })('services/tokenRefresh.ts');
  assert.equal(await validateAndRefreshTokens(), true);
  assert.equal(requests, 0);
});

test('message summaries deduplicate echoes without retaining complete chat histories', () => {
  const { default: reducer, setConversations, addMessage, resetMessages } = loader()('store/slices/messagesSlice.ts');
  let state = reducer(undefined, setConversations([{ id: 'conversation', unreadCount: 0 }]));
  const payload = { conversationId: 'conversation', message: { id: 'message', createdAt: '2026-09-11', content: 'hello' } };
  state = reducer(state, addMessage(payload));
  state = reducer(state, addMessage(payload));
  assert.equal(state.unreadCount, 1);
  assert.deepEqual(state.messages, {});
  state = reducer(state, resetMessages());
  assert.equal(state.conversations.length, 0);
  assert.equal(state.unreadCount, 0);
});

test('pagination advances existing API offsets/pages and stops for empty or final pages', () => {
  const builder = { query: (v) => v, mutation: (v) => v, infiniteQuery: (v) => v };
  const load = loader({ './baseApi': { baseApi: { injectEndpoints: ({ endpoints }) => ({ endpoints: endpoints(builder) }) } } });
  const notifications = load('store/api/notificationApi.ts').notificationApi.endpoints.getNotificationPages;
  assert.deepEqual(notifications.query({ pageParam: 40 }), { url: '/notifications', params: { offset: 40, limit: 40 } });
  const next = notifications.infiniteQueryOptions.getNextPageParam;
  assert.equal(next({ notifications: Array(40), total: 90 }, [], 0), 40);
  assert.equal(next({ notifications: Array(10), total: 90 }, [], 80), undefined);
  assert.equal(next({ notifications: [], total: 90 }, [], 40), undefined);
  const conversations = load('store/api/messageApi.ts').messageApi.endpoints.listConversationPages;
  assert.equal(conversations.infiniteQueryOptions.getNextPageParam({ data: Array(50), meta: { total: 51, limit: 50 } }, [], 1), 2);
  assert.equal(conversations.infiniteQueryOptions.getNextPageParam({ data: Array(1), meta: { total: 51, limit: 50 } }, [], 2), undefined);
});
