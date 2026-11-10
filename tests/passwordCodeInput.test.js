const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const input = tree => nodes(tree).find(node => node.type === 'Input');
const toggle = tree => nodes(tree).find(node => node.type === 'Button');

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
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
      Platform: { OS: os }, Keyboard: { isVisible: () => visible }, StyleSheet: { create: value => value } },
  })('components/auth/PasswordCodeInput.tsx');
  return { calls, frames, props, hooks, render: () => hooks.render(() => PasswordCodeInput(props)),
    nativeState: (isFocused, isVisible) => { focused = isFocused; visible = isVisible; },
    setActive: value => { active = value; }, flush: () => { for (const [id, callback] of frames) { frames.delete(id); callback(); } } };
}

test('Android can reopen a keyboard dismissed while the native password field remains focused', t => {
  const f = fixture(t); const tree = f.render(); f.nativeState(true, false);
  input(tree).props.onPressIn(); assert.deepEqual(f.calls, ['blur']);
  assert.equal(f.frames.size, 1); f.flush(); assert.deepEqual(f.calls, ['blur', 'focus']);
  f.nativeState(true, false); input(f.render()).props.onPressIn(); f.flush();
  assert.deepEqual(f.calls, ['blur', 'focus', 'blur', 'focus']);
});

test('iOS and an already visible Android keyboard do not receive a forced blur cycle', t => {
  const f = fixture(t, 'ios'); f.render(); f.nativeState(true, false); input(f.render()).props.onPressIn();
  assert.deepEqual(f.calls, ['focus']); assert.equal(f.frames.size, 0);
  f.nativeState(true, true); input(f.render()).props.onPressIn(); assert.deepEqual(f.calls, ['focus', 'focus']);
});

test('error retry focuses only after the field becomes editable; ordinary rerenders do not steal focus', t => {
  const f = fixture(t); f.nativeState(true, true);
  f.props.disabled = true; f.render(); f.props.error = 'Mot de passe incorrect.'; f.render();
  assert.equal(f.calls.includes('focus'), false);
  f.props.disabled = false; f.render(); assert.equal(f.calls.filter(v => v === 'focus').length, 1);
  f.render(); f.render(); assert.equal(f.calls.filter(v => v === 'focus').length, 1);
  assert.equal(input(f.render()).props.editable, true);
});

test('pending refocus is cancelled on blur, loading, unmount or native field replacement', t => {
  const f = fixture(t);
  for (const change of ['inactive', 'loading', 'ref']) {
    f.setActive(true); f.props.disabled = false; f.render(); f.nativeState(true, false);
    input(f.render()).props.onPressIn();
    if (change === 'inactive') f.setActive(false);
    if (change === 'loading') f.props.disabled = true;
    const saved = f.props.inputRef.current;
    if (change === 'ref') f.props.inputRef.current = null;
    f.render(); const before = f.calls.length; f.flush();
    assert.equal(f.calls.length, before); f.props.inputRef.current = saved;
  }
  f.setActive(true); f.props.disabled = false; f.render(); f.nativeState(true, false);
  input(f.render()).props.onPressIn(); f.hooks.unmount(); const before = f.calls.length; f.flush();
  assert.equal(f.calls.length, before); assert.equal(f.frames.size, 0);
});

test('password is one visible secure field, not OTP slots, with no secret in accessibility labels', t => {
  const f = fixture(t); f.props.value = '0123'; const tree = f.render();
  assert.equal(nodes(tree).filter(node => node.type === 'Input').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'View').length, 1, 'no fake digit slots');
  for (const node of nodes(tree)) {
    assert.equal(JSON.stringify([node.props.accessibilityLabel, node.props.accessibilityHint, node.props.accessibilityValue]).includes('0123'), false);
  }
  const field = nodes(tree).find(node => node.type === 'Input');
  assert.equal(field.props.secureTextEntry, true); assert.equal(field.props.keyboardType, 'number-pad');
  assert.equal(field.props.showSoftInputOnFocus, true); assert.equal(field.props.maxLength, 4);
  assert.notEqual(field.props.accessible, false); assert.notEqual(field.props.pointerEvents, 'none');
  assert.notEqual(flatten(field.props.style).position, 'absolute');
  assert.equal(flatten(tree.props.style).width, '100%');
  assert.ok(flatten(field.props.style).minHeight >= 48);
  assert.equal(field.props.textContentType, 'password');
  assert.equal(field.props.autoComplete, 'off');
  assert.equal(field.props.importantForAutofill, 'no');
  field.props.onChangeText('0a12-34'); assert.deepEqual(f.calls, [['change', '0123']]);
  f.props.disabled = true; const busy = f.render();
  input(busy).props.onPressIn(); input(busy).props.onChangeText('9999'); toggle(busy).props.onPress();
  assert.equal(f.calls.filter(value => Array.isArray(value)).length, 1);
  assert.equal(input(f.render()).props.secureTextEntry, true);
});

test('visibility is explicit, reversible and remasked on loading, leaving or clearing the field', t => {
  const f = fixture(t); f.props.value = '0123';
  assert.equal(input(f.render()).props.secureTextEntry, true);
  toggle(f.render()).props.onPress();
  assert.equal(input(f.render()).props.secureTextEntry, false);
  assert.match(toggle(f.render()).props.accessibilityLabel, /^Masquer/);
  toggle(f.render()).props.onPress();
  assert.equal(input(f.render()).props.secureTextEntry, true);
  for (const reason of ['loading', 'inactive', 'empty']) {
    toggle(f.render()).props.onPress();
    if (reason === 'loading') f.props.disabled = true;
    if (reason === 'inactive') f.setActive(false);
    if (reason === 'empty') f.props.value = '';
    f.render();
    assert.equal(input(f.render()).props.secureTextEntry, true);
    f.props.disabled = false; f.setActive(true); f.props.value = '0123';
    assert.equal(input(f.render()).props.secureTextEntry, true);
  }
  assert.equal(f.calls.some(Array.isArray), false, 'visibility never changes/submits the password');
  f.props.newPassword = true;
  assert.equal(input(f.render()).props.textContentType, 'newPassword');
  assert.equal(input(f.render()).props.value, '0123', 'leading zero is preserved');
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
