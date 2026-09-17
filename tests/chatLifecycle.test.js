const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function exitFixture({ platform = 'ios', visible = true, canGoBack = true } = {}) {
  const hooks = hookHarness(), routes = [], keyboardListeners = new Set(), backListeners = new Set();
  let dismissals = 0;
  const Keyboard = {
    isVisible: () => visible, dismiss: () => { dismissals++; },
    addListener: (_event, callback) => { keyboardListeners.add(callback); return { remove: () => keyboardListeners.delete(callback) }; },
  };
  const { useChatExit } = loader({ react: hooks.react, 'react-native': { Keyboard, Platform: { OS: platform },
    BackHandler: { addEventListener: (_event, callback) => { backListeners.add(callback); return { remove: () => backListeners.delete(callback) }; } },
  } })('hooks/chat/useChatExit.ts');
  const router = { canGoBack: () => canGoBack, back: () => routes.push('back'), replace: route => routes.push(route) };
  const props = { id: 'conversation', active: true };
  return { hooks, props, routes, keyboardListeners, backListeners, dismissals: () => dismissals,
    render: () => hooks.render(() => useChatExit(props.id, props.active, router)) };
}

test('iOS back releases chat work before dismissing the keyboard and navigates only once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = exitFixture();
  const initial = app.render();
  initial.goBack(); initial.goBack();
  assert.equal(initial.isCurrent(), false);
  assert.deepEqual(app.routes, []);
  const leaving = app.render();
  assert.equal(leaving.leaving, true);
  assert.equal(app.dismissals(), 1);
  const hide = [...app.keyboardListeners][0];
  hide(); hide();
  t.mock.timers.tick(39);
  assert.deepEqual(app.routes, []);
  t.mock.timers.tick(1);
  assert.deepEqual(app.routes, ['back']);
  t.mock.timers.tick(1000);
  assert.deepEqual(app.routes, ['back']);
  app.hooks.unmount();
  assert.equal(app.keyboardListeners.size, 0);
  assert.equal(app.backListeners.size, 0);
});

test('a missing keyboard hide event cannot leave iOS trapped in the conversation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = exitFixture();
  app.render().goBack(); app.render();
  t.mock.timers.tick(300);
  t.mock.timers.tick(40);
  assert.deepEqual(app.routes, ['back']);
  app.hooks.unmount();
});

test('Android system back and direct-link conversations use the same guarded exit', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = exitFixture({ platform: 'android', visible: false, canGoBack: false });
  app.render();
  assert.equal([...app.backListeners][0](), true);
  app.render();
  t.mock.timers.tick(0); t.mock.timers.tick(40);
  assert.deepEqual(app.routes, ['/(tabs)/messages']);
  app.hooks.unmount();
});

test('unmount and loss of foreground cancel delayed exit instead of popping another screen', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const unmount of [true, false]) {
    const app = exitFixture();
    const old = app.render();
    old.goBack(); app.render();
    if (unmount) app.hooks.unmount();
    else { app.props.active = false; app.render(); }
    t.mock.timers.tick(1000); t.mock.timers.tick(1000);
    assert.deepEqual(app.routes, []);
    assert.equal(old.isCurrent(), false);
    assert.equal(app.keyboardListeners.size, 0);
    assert.equal(app.backListeners.size, 0);
    if (!unmount) {
      app.props.active = true; app.render();
      t.mock.timers.tick(300); t.mock.timers.tick(40);
      assert.deepEqual(app.routes, ['back']);
      app.hooks.unmount();
    }
  }
});

function realtimeFixture() {
  const hooks = hookHarness(), subscriptions = [], calls = [], messages = [], actions = [];
  let current = true;
  const props = { enabled: true, conversationId: 'chat', bookingId: 'booking', userId: 'me',
    isCurrent: () => current, dispatch: action => actions.push(action) };
  const { useChatRealtime } = loader({ react: hooks.react,
    '@/services/chatSocket': { chatSocket: {
      subscribeToMessages: callback => { subscriptions.push(callback); calls.push('subscribe'); return () => calls.push('unsubscribe'); },
      joinBookingRoom: () => { calls.push('join'); return new Promise(() => {}); },
      leaveBookingRoom: async () => { calls.push('leave'); },
    } },
    '@/store/api/messageApi': { messageApi: { util: { updateQueryData: (_endpoint, args, recipe) => { recipe(messages); return args; } } } },
    '@/store/slices/messagesSlice': { addMessage: payload => payload },
  })('hooks/chat/useChatRealtime.ts');
  return { hooks, props, calls, subscriptions, messages, actions, stopCurrent: () => { current = false; },
    render: () => hooks.render(() => useChatRealtime(props)) };
}

test('chat subscribes before joining, rejects unrelated/invalid events and deduplicates message echoes', () => {
  const app = realtimeFixture(); app.render();
  assert.deepEqual(app.calls, ['subscribe', 'join']);
  const receive = app.subscriptions[0];
  receive(null); receive({ conversationId: 'chat' }); receive({ id: 'other', conversationId: 'other', content: 'hello' });
  assert.equal(app.actions.length, 0);
  const msg = { id: 'one', conversationId: 'chat', senderId: 'me', content: 'Bonjour' };
  receive(msg); receive(msg);
  assert.deepEqual(app.messages, [msg]);
  app.stopCurrent(); receive({ ...msg, id: 'late' });
  assert.equal(app.messages.length, 1);
  app.hooks.unmount();
  assert.deepEqual(app.calls, ['subscribe', 'join', 'unsubscribe', 'leave']);
});

test('leaving releases a room immediately even while authentication is pending and ignores old callbacks', () => {
  const app = realtimeFixture(); app.render();
  const receive = app.subscriptions[0];
  app.props.enabled = false; app.render();
  assert.deepEqual(app.calls, ['subscribe', 'join', 'unsubscribe', 'leave']);
  receive({ id: 'late', conversationId: 'chat', content: 'hello' });
  assert.equal(app.actions.length, 0);
  app.props.enabled = true; app.props.bookingId = null; app.render();
  assert.equal(app.calls.at(-1), 'subscribe');
  app.hooks.unmount();
  assert.equal(app.calls.at(-1), 'unsubscribe');
});
