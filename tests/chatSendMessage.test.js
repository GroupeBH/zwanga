const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(editing = false) {
  const hooks = hookHarness(), requests = [], actions = [], messages = [];
  let resolve, reject, draft = 'Bonjour', edits = 0;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const mutation = args => { requests.push(args); return { unwrap: () => pending }; };
  const { useChatSendMessage } = loader({ react: hooks.react,
    '@/services/analytics': { trackEvent() {} },
    '@/store/api/messageApi': { messageApi: { util: { updateQueryData: (name, args, recipe) => {
      if (name === 'getConversationMessages') recipe(messages); return args;
    } } } },
    '@/store/slices/messagesSlice': { addMessage: payload => payload },
  })('hooks/chat/useChatSendMessage.ts');
  const props = { conversationId: 'chat', sending: false, editingMessageId: editing ? 'edit' : null,
    setMessage: value => { draft = typeof value === 'function' ? value(draft) : value; },
    setEditingMessageId: () => { edits++; }, dispatch: action => actions.push(action),
    sendMessageMutation: mutation, editMessageMutation: mutation, conversation: { bookingId: 'booking' }, isCurrent: () => true };
  return { hooks, props, requests, actions, messages, resolve, reject, draft: () => draft, edits: () => edits,
    type: value => { draft = value; }, render: () => hooks.render(() => useChatSendMessage({ ...props, message: draft })) };
}

for (const editing of [false, true]) {
  test(`${editing ? 'editing' : 'sending'} rejects double taps before React updates loading state`, async () => {
    const app = fixture(editing), action = app.render().handleSend;
    const first = action(); await action();
    assert.equal(app.requests.length, 1);
    assert.equal(app.draft(), '');
    assert.equal(app.requests[0].content, 'Bonjour');
    assert.equal(app.requests[0].conversationId, 'chat');
    const saved = { id: editing ? 'edit' : 'new', content: 'Bonjour' };
    if (editing) app.messages.push({ ...saved, content: 'Old' });
    app.resolve(saved); await first;
    assert.deepEqual(app.messages, [saved]);
    app.hooks.unmount();
  });
}

test('a failed send restores its draft but never overwrites a new message being typed', async () => {
  for (const nextDraft of ['', 'Nouveau message']) {
    const app = fixture(), pending = app.render().handleSend();
    app.type(nextDraft);
    app.reject(new Error('offline')); await pending;
    assert.equal(app.draft(), nextDraft || 'Bonjour');
    app.hooks.unmount();
  }
});

test('a late failure after unmount or back does not update the closed conversation', async () => {
  for (const unmount of [true, false]) {
    const app = fixture();
    let current = true;
    app.props.isCurrent = () => current;
    const pending = app.render().handleSend();
    if (unmount) app.hooks.unmount();
    else current = false;
    app.reject(new Error('offline')); await pending;
    assert.equal(app.draft(), '');
    if (!unmount) app.hooks.unmount();
  }
});

test('a successful late edit updates the RTK cache without changing the closed editor state', async () => {
  const app = fixture(true), pending = app.render().handleSend();
  app.messages.push({ id: 'edit', content: 'Old' });
  app.hooks.unmount();
  app.resolve({ id: 'edit', content: 'Bonjour' }); await pending;
  assert.equal(app.edits(), 0);
  assert.equal(app.messages[0].content, 'Bonjour');
});
