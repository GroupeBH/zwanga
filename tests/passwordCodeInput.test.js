const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));

function fixture(t, os = 'android') {
  const hooks = hookHarness(), frames = new Map(), calls = [];
  const previous = { request: global.requestAnimationFrame, cancel: global.cancelAnimationFrame };
  let sequence = 0, active = true, focused = false, visible = false;
  global.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id; };
  global.cancelAnimationFrame = id => frames.delete(id);
  t.after(() => { hooks.unmount(); global.requestAnimationFrame = previous.request; global.cancelAnimationFrame = previous.cancel; });
  const props = { value: '', disabled: false, label: 'Mot de passe à quatre chiffres', login: true,
    inputRef: { current: { isFocused: () => focused, focus: () => { calls.push('focus'); focused = true; },
      blur: () => { calls.push('blur'); focused = false; } } }, onChange: value => calls.push(['change', value]) };
  const { PasswordCodeInput } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
      Platform: { OS: os }, Keyboard: { isVisible: () => visible }, StyleSheet: { create: value => value } },
  })('components/auth/PasswordCodeInput.tsx');
  return { calls, frames, props, hooks, render: () => hooks.render(() => PasswordCodeInput(props)),
    nativeState: (isFocused, isVisible) => { focused = isFocused; visible = isVisible; },
    setActive: value => { active = value; }, flush: () => { for (const [id, callback] of frames) { frames.delete(id); callback(); } } };
}

test('Android can reopen a keyboard dismissed while the invisible native field remains focused', t => {
  const f = fixture(t); const tree = f.render(); f.nativeState(true, false);
  tree.props.onPress(); assert.deepEqual(f.calls, ['blur']);
  assert.equal(f.frames.size, 1); f.flush(); assert.deepEqual(f.calls, ['blur', 'focus']);
  f.nativeState(true, false); f.render().props.onPress(); f.flush();
  assert.deepEqual(f.calls, ['blur', 'focus', 'blur', 'focus']);
});

test('iOS and an already visible Android keyboard do not receive a forced blur cycle', t => {
  const f = fixture(t, 'ios'); f.render(); f.nativeState(true, false); f.render().props.onPress();
  assert.deepEqual(f.calls, ['focus']); assert.equal(f.frames.size, 0);
  f.nativeState(true, true); f.render().props.onPress(); assert.deepEqual(f.calls, ['focus', 'focus']);
});

test('error retry focuses only after the field becomes editable; ordinary rerenders do not steal focus', t => {
  const f = fixture(t); f.nativeState(true, true);
  f.props.disabled = true; f.render(); f.props.error = 'Mot de passe incorrect.'; f.render();
  assert.equal(f.calls.includes('focus'), false);
  f.props.disabled = false; f.render(); assert.equal(f.calls.filter(v => v === 'focus').length, 1);
  f.render(); f.render(); assert.equal(f.calls.filter(v => v === 'focus').length, 1);
  assert.equal(f.render().props.disabled, false);
});

test('pending refocus is cancelled on blur, loading, unmount or native field replacement', t => {
  const f = fixture(t);
  for (const change of ['inactive', 'loading', 'ref']) {
    f.setActive(true); f.props.disabled = false; f.render(); f.nativeState(true, false);
    f.render().props.onPress();
    if (change === 'inactive') f.setActive(false);
    if (change === 'loading') f.props.disabled = true;
    const saved = f.props.inputRef.current;
    if (change === 'ref') f.props.inputRef.current = null;
    f.render(); const before = f.calls.length; f.flush();
    assert.equal(f.calls.length, before); f.props.inputRef.current = saved;
  }
  f.setActive(true); f.props.disabled = false; f.render(); f.nativeState(true, false);
  f.render().props.onPress(); f.hooks.unmount(); const before = f.calls.length; f.flush();
  assert.equal(f.calls.length, before); assert.equal(f.frames.size, 0);
});

test('password field keeps secure four-digit input, whole-row touch size and no spoken secret', t => {
  const f = fixture(t); f.props.value = '0123'; const tree = f.render();
  assert.deepEqual(tree.props.accessibilityValue, { text: '4 chiffres saisis sur 4' });
  assert.equal(JSON.stringify(tree.props.accessibilityValue).includes('0123'), false);
  const field = nodes(tree).find(node => node.type === 'Input');
  assert.equal(field.props.secureTextEntry, true); assert.equal(field.props.keyboardType, 'number-pad');
  assert.equal(field.props.showSoftInputOnFocus, true); assert.equal(field.props.maxLength, 4);
  assert.equal(flatten(field.props.style).width, '100%'); assert.equal(flatten(field.props.style).height, '100%');
  field.props.onChangeText('0a12-34'); assert.deepEqual(f.calls, [['change', '0123']]);
  f.props.disabled = true; const busy = f.render();
  busy.props.onPress(); nodes(busy).find(node => node.type === 'Input').props.onChangeText('9999');
  assert.equal(f.calls.filter(value => Array.isArray(value)).length, 1);
});

test('login messages distinguish credentials, connectivity and rate limits without PIN jargon', () => {
  const { passwordLoginError } = loader()('features/auth/passwordLoginError.ts');
  for (const [error, expected] of [
    [{ status: 401, data: { message: 'Invalid PIN' } }, /Mot de passe incorrect/],
    [{ status: 401 }, /numéro et votre mot de passe/],
    [{ status: 429, data: { message: 'Invalid PIN' } }, /Trop de tentatives/],
    [{ status: 503, data: { message: 'Invalid PIN' } }, /indisponible/],
    [{ status: 'FETCH_ERROR' }, /Internet/], [{ status: 'TIMEOUT_ERROR' }, /Internet/],
    [new Error('La connexion n’a pas pu être confirmée. Réessayez.'), /confirmée/],
  ]) {
    const message = passwordLoginError(error); assert.match(message, expected);
    assert.doesNotMatch(message, /\bPIN\b|session a expiré/);
  }
});
