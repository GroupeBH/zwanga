const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const hooks = hookHarness(), calls = [];
  const person = { id: 'reservation-id', userId: 'public-user-id', firstName: 'Camille', seats: 1 };
  const roster = { eligible: true, online: true, participants: [person] };
  const state = { session: 1, fail: false };
  const { useCoPassengerActions } = loader({ react: hooks.react,
    'expo-router': { useRouter: () => ({ push: value => calls.push(['route', value]) }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.session },
    '@/hooks/navigation/useTripContactMessaging': { useContactMessaging: (contacts, close, enabled) => {
      state.contacts = contacts; state.enabled = enabled;
      return { isOpeningConversation: false, openMessage: async contact => {
        if (state.fail) throw Error('private-error');
        calls.push(['message', contact]); close();
      } };
    } },
  })('hooks/trip-detail/useCoPassengerActions.ts');
  return { hooks, calls, person, roster, state,
    render: () => hooks.render(() => useCoPassengerActions(roster, () => calls.push(['close']))) };
}

test('explicit profile tap closes the sheet and navigates with user ID, not reservation ID', () => {
  const m = fixture(), actions = m.render();
  assert.deepEqual(m.calls, []);
  actions.profile(m.person);
  assert.deepEqual(m.calls, [['close'], ['route', { pathname: '/public-profile/[id]', params: { id: 'public-user-id' } }]]);
  m.hooks.unmount();
});

test('direct message has no booking context and only opens on an explicit tap', async () => {
  const m = fixture(), actions = m.render();
  assert.deepEqual(m.calls, []);
  await actions.message(m.person);
  assert.deepEqual(m.calls[0], ['message', { id: 'public-user-id', name: 'Camille', phone: null, detail: 'Passager du trajet' }]);
  assert.equal(m.state.contacts[0].bookingId, undefined);
  m.hooks.unmount();
});

test('legacy, inactive, offline, departed and stale-account identities cannot open actions', async () => {
  for (const boundary of ['offline', 'removed', 'busy', 'failed', 'session', 'unmount']) {
    const m = fixture(), stale = m.render();
    if (boundary === 'offline') m.roster.online = false;
    if (boundary === 'removed') m.roster.participants = [];
    if (boundary === 'busy') m.roster.busy = true;
    if (boundary === 'failed') m.roster.failed = true;
    if (boundary === 'session') m.state.session++;
    if (boundary === 'unmount') m.hooks.unmount(); else m.render();
    stale.profile(m.person); await stale.message(m.person);
    assert.deepEqual(m.calls, [], boundary);
    m.hooks.unmount();
  }
  const m = fixture(), actions = m.render();
  actions.profile({ ...m.person, userId: null });
  await actions.message({ ...m.person, userId: 'someone-else' });
  assert.deepEqual(m.calls, []);
  m.hooks.unmount();
});

test('message failure is recoverable without leaking native errors', async () => {
  const m = fixture(); m.state.fail = true;
  await m.render().message(m.person);
  assert.equal(m.render().error, 'Messagerie indisponible. Réessayez.');
  m.state.fail = false; await m.render().message(m.person);
  assert.equal(m.render().error, '');
  m.hooks.unmount();
});
