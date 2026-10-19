const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', Switch: 'Switch', StyleSheet: { create: x => x } };

function options() {
  const calls = [];
  const model = {
    areDirectOptionsExpanded: false, directAcceptRequiresPassengerKyc: false,
    tripRequest: { departure: { name: 'Départ test' }, arrival: { name: 'Arrivée test' } },
    directAcceptDepartureReference: 'Repère A', directAcceptArrivalReference: 'Repère B',
    directAcceptDepartureLocation: { title: 'Départ choisi' }, directAcceptArrivalLocation: { title: 'Arrivée choisie' },
    setAreDirectOptionsExpanded: value => { model.areDirectOptionsExpanded = value(model.areDirectOptionsExpanded); },
    setDirectAcceptRequiresPassengerKyc: value => { model.directAcceptRequiresPassengerKyc = value; },
    setDirectAcceptDepartureReference: value => { model.directAcceptDepartureReference = value; },
    setDirectAcceptArrivalReference: value => { model.directAcceptArrivalReference = value; },
    openDirectRouteOverridePicker: (...args) => calls.push(args),
    handleOpenDirectAcceptModal: () => { throw new Error('Legacy acceptance modal must not open'); },
  };
  const { RequestDecisionOptions } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/request-detail/RequestDecisionOptions.tsx');
  return { model, calls, render: (disabled = false) => RequestDecisionOptions({ model, disabled }) };
}

test('other options expands in the existing form without another vehicle selector or acceptance modal', () => {
  const f = options(); let tree = f.render();
  const toggle = elements(tree).find(item => item.type === 'Pressable');
  assert.equal(toggle.props.accessibilityState.expanded, false);
  assert.equal(elements(tree).some(item => item.type === 'TextInput'), false);
  toggle.props.onPress(); tree = f.render();
  assert.equal(elements(tree).find(item => item.type === 'Pressable').props.accessibilityState.expanded, true);
  assert.equal(elements(tree).filter(item => item.type === 'TextInput').length, 2);
  assert.match(words(tree), /Départ choisi/); assert.match(words(tree), /Arrivée choisie/);
  assert.doesNotMatch(words(tree), /Accepter|Véhicule/);
  elements(tree).find(item => item.type === 'Pressable').props.onPress();
  assert.equal(f.model.areDirectOptionsExpanded, false);
});

test('inline options retain identity requirements, references and both map selections', () => {
  const f = options(); f.model.areDirectOptionsExpanded = true;
  const tree = f.render();
  elements(tree).find(item => item.type === 'Switch').props.onValueChange(true);
  const inputs = elements(tree).filter(item => item.type === 'TextInput');
  assert.deepEqual(inputs.map(item => item.props.value), ['Repère A', 'Repère B']);
  inputs[0].props.onChangeText('Nouveau départ'); inputs[1].props.onChangeText('Nouvelle arrivée');
  const points = elements(tree).filter(item => item.type === 'Pressable' && item.props.accessibilityLabel);
  points.forEach(item => item.props.onPress());
  assert.equal(f.model.directAcceptRequiresPassengerKyc, true);
  assert.equal(f.model.directAcceptDepartureReference, 'Nouveau départ');
  assert.equal(f.model.directAcceptArrivalReference, 'Nouvelle arrivée');
  assert.deepEqual(f.calls, [['directDeparture', true], ['directArrival', true]]);
  f.model.areDirectOptionsExpanded = false;
  assert.equal(elements(f.render()).some(item => item.type === 'TextInput'), false);
  assert.equal(f.model.directAcceptDepartureReference, 'Nouveau départ', 'collapsing does not discard settings');
});

test('busy inline options cannot mutate settings or open the location picker', () => {
  const f = options(); f.model.areDirectOptionsExpanded = true;
  for (const item of elements(f.render(true))) {
    if (item.type === 'Pressable') { assert.equal(item.props.disabled, true); item.props.onPress(); }
    if (item.type === 'Switch') { assert.equal(item.props.disabled, true); item.props.onValueChange(true); }
    if (item.type === 'TextInput') { assert.equal(item.props.editable, false); item.props.onChangeText('Changed'); }
  }
  assert.equal(f.model.areDirectOptionsExpanded, true);
  assert.equal(f.model.directAcceptRequiresPassengerKyc, false);
  assert.equal(f.model.directAcceptDepartureReference, 'Repère A');
  assert.equal(f.model.directAcceptArrivalReference, 'Repère B'); assert.deepEqual(f.calls, []);
});

function picker(t, platform = 'android') {
  const hooks = hookHarness(); const calls = [], timers = new Map(); let serial = 0;
  const originalTimeout = global.setTimeout, originalClear = global.clearTimeout;
  global.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, delay }); return id; };
  global.clearTimeout = id => timers.delete(id);
  t.after(() => { hooks.unmount(); global.setTimeout = originalTimeout; global.clearTimeout = originalClear; });
  const form = { showDirectAcceptModal: false, routeOverridePickerTarget: null,
    directPickerTransitionTimerRef: { current: null }, directPickerRestorePendingRef: { current: false },
    setShowDirectAcceptModal: value => { form.showDirectAcceptModal = value; calls.push(['modal', value]); },
    setRouteOverridePickerTarget: value => { form.routeOverridePickerTarget = value; },
    setDirectAcceptDepartureLocation: value => calls.push(['departure', value]),
    setDirectAcceptArrivalLocation: value => calls.push(['arrival', value]),
  };
  const f = { form, scope: 'driver:order', enabled: true, calls, timers };
  const { useRequestRouteOverridePicker } = loader({ react: { ...React, ...hooks.react },
    'react-native': { Platform: { OS: platform }, Keyboard: { dismiss: () => calls.push(['keyboard']) } },
  })('hooks/request-detail/useRequestRouteOverridePicker.ts');
  f.render = () => hooks.render(() => useRequestRouteOverridePicker(form, f.scope, f.enabled));
  f.flush = () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(item => item.callback()); };
  f.unmount = () => hooks.unmount();
  return f;
}

for (const platform of ['android', 'ios']) {
  test(`${platform}: selecting or dismissing an inline location returns to the sheet, never the legacy modal`, t => {
    const f = picker(t, platform), actions = f.render(), location = { latitude: -4.3, longitude: 15.3, title: 'Point test' };
    actions.openDirectRouteOverridePicker('directDeparture', true);
    assert.equal(f.form.routeOverridePickerTarget, 'directDeparture'); assert.equal(f.timers.size, 0);
    f.render().handleRouteOverrideSelected(location);
    assert.equal(f.form.routeOverridePickerTarget, null); assert.equal(f.timers.size, 0);
    assert.deepEqual(f.calls.filter(item => item[0] === 'departure'), [['departure', location]]);
    actions.openDirectRouteOverridePicker('directArrival', true);
    f.render().restoreDirectAcceptModalAfterLocationPicker();
    f.render().restoreDirectAcceptModalAfterLocationPicker(); f.flush();
    assert.equal(f.form.routeOverridePickerTarget, null);
    assert.equal(f.calls.some(item => item[0] === 'modal' && item[1]), false);
    assert.equal(f.calls.some(item => item[0] === 'arrival'), false);
  });

  test(`${platform}: the legacy path only restores a modal that was actually open, once`, t => {
    const f = picker(t, platform); f.form.showDirectAcceptModal = true;
    const actions = f.render(); actions.openDirectRouteOverridePicker('directArrival');
    assert.equal(f.form.showDirectAcceptModal, false); assert.equal(f.form.routeOverridePickerTarget, null);
    assert.equal([...f.timers.values()][0].delay, platform === 'ios' ? 350 : 80);
    f.flush(); assert.equal(f.form.routeOverridePickerTarget, 'directArrival');
    const next = f.render(); next.handleRouteOverrideSelected({ title: 'Arrivée choisie' });
    next.restoreDirectAcceptModalAfterLocationPicker();
    assert.equal(f.timers.size, 1); f.flush();
    assert.equal(f.calls.filter(item => item[0] === 'modal' && item[1]).length, 1);
    assert.deepEqual(f.calls.filter(item => item[0] === 'arrival'), [['arrival', { title: 'Arrivée choisie' }]]);
  });
}

test('picker ignores late callbacks after a scope change, unmount or loss of acceptance eligibility', t => {
  const f = picker(t); f.form.showDirectAcceptModal = true;
  const old = f.render(); old.openDirectRouteOverridePicker('directDeparture');
  const late = [...f.timers.values()][0].callback;
  f.scope = 'other:order'; f.render(); late();
  assert.equal(f.form.routeOverridePickerTarget, null); assert.equal(f.timers.size, 0);
  old.handleRouteOverrideSelected({ title: 'Old' });
  f.render().openDirectRouteOverridePicker('directDeparture', true);
  f.enabled = false; f.render().handleRouteOverrideSelected({ title: 'Ineligible' });
  f.render().openDirectRouteOverridePicker('directArrival', true);
  assert.equal(f.form.routeOverridePickerTarget, null);
  assert.equal(f.calls.some(item => item[0] === 'departure' || item[0] === 'arrival'), false);
  f.enabled = true; f.form.showDirectAcceptModal = true;
  f.render().openDirectRouteOverridePicker('directDeparture'); f.flush();
  f.render().restoreDirectAcceptModalAfterLocationPicker();
  const restore = [...f.timers.values()][0].callback;
  f.unmount(); restore();
  assert.equal(f.timers.size, 0); assert.equal(f.calls.some(item => item[0] === 'modal' && item[1]), false);
});
