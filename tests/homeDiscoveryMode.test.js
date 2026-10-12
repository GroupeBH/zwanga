const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(isDriver = true, userId = 'me') {
  const hooks = hookHarness();
  const { useHomeDiscoveryMode } = loader({ react: hooks.react })('hooks/home/useHomeDiscoveryMode.ts');
  const props = { isDriver, currentUser: { id: userId } };
  return { hooks, props, draw: () => hooks.render(() => useHomeDiscoveryMode(props)) };
}

test('Home defaults to clients for drivers and trips for passengers, including a late server role', () => {
  const app = fixture(false);
  assert.equal(app.draw().isRequestsSheetMode, false);
  app.draw().setHomeSheetMode('requests');
  assert.equal(app.draw().isRequestsSheetMode, false);
  app.props.isDriver = true;
  assert.equal(app.draw().isRequestsSheetMode, true, 'default updates on the first render of the authenticated role');
  app.hooks.unmount();
});

test('a driver may choose trips and return to clients without a reset on ordinary rerenders', () => {
  const app = fixture();
  const initial = app.draw();
  assert.equal(initial.isRequestsSheetMode, true);
  initial.setHomeSheetMode('trips');
  for (let i = 0; i < 100; i++) {
    app.props.currentUser = { id: 'me', name: 'Refreshed' };
    assert.equal(app.draw().isRequestsSheetMode, false);
    assert.equal(app.draw().setHomeSheetMode, initial.setHomeSheetMode);
  }
  app.draw().setHomeSheetMode('requests');
  assert.equal(app.draw().isRequestsSheetMode, true);
  app.hooks.unmount();
  const reopened = fixture();
  assert.equal(reopened.draw().isRequestsSheetMode, true, 'a fresh Home mount uses the role default');
  reopened.hooks.unmount();
});

test('account and role changes reset the choice without leaking old callbacks or client discovery', () => {
  const app = fixture();
  const oldAction = app.draw().setHomeSheetMode;
  oldAction('trips');
  assert.equal(app.draw().isRequestsSheetMode, false);
  app.props.currentUser = { id: 'another-driver' };
  assert.equal(app.draw().isRequestsSheetMode, true);
  oldAction('trips');
  assert.equal(app.draw().isRequestsSheetMode, true);
  app.props.currentUser = { id: 'me' };
  assert.equal(app.draw().isRequestsSheetMode, true);
  app.draw().setHomeSheetMode('trips');
  assert.equal(app.draw().isRequestsSheetMode, false);
  app.props.isDriver = false;
  assert.equal(app.draw().isRequestsSheetMode, false);
  oldAction('requests');
  assert.equal(app.draw().isRequestsSheetMode, false);
  app.props.isDriver = true;
  assert.equal(app.draw().isRequestsSheetMode, true, 'a restored driver role starts with clients, not an old trip choice');
  app.hooks.unmount();
});
