const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  return [element, ...nodes(element.props.children)];
}
const request = { id: 'request', status: 'pending', confirmedPassengerCount: 1, requiredPassengerCount: 2 };
function environment(mutate = async () => ({})) {
  const hooks = hookHarness();
  const calls = [], dialogs = [];
  const load = loader({
    react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/store/api/tripApi': { useCancelDriverTripInterruptionMutation: () => [
      id => { calls.push(id); return { unwrap: () => mutate() }; }, { isLoading: false },
    ] },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '../screen-styles/app/trip/manage/detail/index': { styles: {} },
  });
  const { ManageTripInterruptionNotice } = load('features/manage-trip/ManageTripInterruptionNotice.tsx');
  return { calls, dialogs, load, render: trip => hooks.render(() => ManageTripInterruptionNotice({ trip })) };
}

test('pending interruption feedback is inline, includes the confirmation count and permits cancelling without opening navigation', async () => {
  let resolve;
  const env = environment(() => new Promise(done => { resolve = done; }));
  const all = nodes(env.render({ id: 'trip', status: 'ongoing', interruptionRequest: request }));
  const text = all.filter(node => node.type === 'Text').map(node => node.props.children).join(' ');
  assert.match(text, /Interruption en attente/);
  assert.match(text, /1\/2/);
  assert.match(text, /reste en cours/);
  assert.equal(all.some(node => node.type === 'Modal'), false);
  const cancel = all.find(node => node.type === 'Button');
  cancel.props.onPress(); cancel.props.onPress();
  assert.deepEqual(env.calls, ['trip']);
  resolve({});
  await Promise.resolve();
  assert.equal(env.dialogs.length, 0, 'successful cancellation has no extra confirmation or success popup');
});

test('interruption feedback distinguishes rejected, paused and restarted trips', () => {
  const env = environment();
  assert.equal(env.render({ id: 'trip', status: 'ongoing' }), null);
  const rejected = nodes(env.render({ id: 'trip', status: 'ongoing', interruptionRequest: { ...request, status: 'rejected' } }));
  assert.ok(rejected.some(node => node.props.children === 'Interruption refusée'));
  assert.equal(rejected.some(node => node.type === 'Button'), false);
  const paused = nodes(env.render({ id: 'trip', status: 'upcoming', interruptionRequest: { ...request, status: 'completed' } }));
  assert.ok(paused.some(node => node.props.children === 'Trajet interrompu'));
  assert.equal(env.render({ id: 'trip', status: 'ongoing', interruptionRequest: { ...request, status: 'completed' } }), null);
});

test('a pending request disables a duplicate pause, without disabling navigation or trip editing', () => {
  const env = environment();
  const { ManageTripActionsFooter } = env.load('features/manage-trip/ManageTripActionsFooter.tsx');
  const action = () => {};
  const tree = ManageTripActionsFooter({ state: { trip: { status: 'ongoing', interruptionRequest: request }, insets: { bottom: 0 } },
    actions: { handlePauseTrip: action, handleOpenNavigation: action, handleOpenTripEdit: action } });
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].props.disabled, undefined);
  assert.equal(buttons[1].props.disabled, undefined);
  assert.equal(buttons[2].props.disabled, true);
  assert.equal(buttons[2].props.accessibilityLabel, 'Interruption en attente de confirmation');
});
