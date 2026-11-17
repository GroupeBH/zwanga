const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';

function fixture(size = 6, os = 'android') {
  const hooks = hookHarness(), changes = [], focuses = [], reads = [];
  const io = { clipboard: async () => '012345'.slice(0, size) };
  const props = { code: Array(size).fill(''), disabled: false,
    inputRefs: { current: Array.from({ length: size }, (_, index) => ({ focus: () => focuses.push(index) })) },
    onChange: value => { changes.push(value); props.code = value; } };
  const { OtpCodeInput } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', Platform: { OS: os }, StyleSheet: { create: value => value } },
    'expo-clipboard': { getStringAsync: () => { reads.push(1); return io.clipboard(); } },
  })('components/auth/OtpCodeInput.tsx');
  const render = () => hooks.render(() => OtpCodeInput(props));
  return { props, hooks, io, changes, focuses, reads, render,
    inputs: () => nodes(render()).filter(node => node.type === 'Input'),
    paste: () => nodes(render()).find(node => node.type === 'Button').props.onPress() };
}

for (const size of [5, 6]) {
  test(`${size} boxes: complete paste starts at the first box, retaining zeros without focus jumps`, () => {
    for (let index = 0; index < size; index++) {
      const app = fixture(size); app.props.code = Array(size).fill('9');
      app.inputs()[index].props.onChangeText('012345'.slice(0, size).split('').join(' - '));
      assert.equal(app.props.code.join(''), '012345'.slice(0, size));
      assert.ok(app.props.code.every(digit => digit.length === 1));
      assert.deepEqual(app.focuses, []);
      app.hooks.unmount();
    }
  });

  test(`${size} boxes: native events before rerender never erase previous digits or repeat the last one`, () => {
    const app = fixture(size), inputs = app.inputs();
    for (let i = 0; i < size; i++) inputs[i].props.onChangeText(String(i));
    assert.equal(app.props.code.join(''), '012345'.slice(0, size));
    assert.deepEqual(app.focuses, Array.from({ length: size - 1 }, (_, i) => i + 1));
    inputs[1].props.onChangeText('9');
    assert.equal(app.props.code.join(''), '092345'.slice(0, size));
    inputs[size - 1].props.onChangeText('987654'.slice(0, size));
    inputs[size - 1].props.onChangeText('7');
    assert.equal(app.props.code.join(''), '987654'.slice(0, size - 1) + '7');
    app.hooks.unmount();
  });

  test(`${size} boxes: explicit paste is atomic, single-flight and only reads on demand`, async () => {
    const app = fixture(size), pending = deferred(); app.io.clipboard = () => pending.promise;
    app.render(); assert.deepEqual(app.reads, []);
    app.paste(); app.paste();
    assert.equal(app.reads.length, 1);
    assert.equal(nodes(app.render()).find(node => node.type === 'Button').props.disabled, true);
    pending.resolve('012345'.slice(0, size).split('').join(' ')); await tick();
    assert.equal(app.changes.length, 1);
    assert.equal(app.props.code.join(''), '012345'.slice(0, size));
    assert.deepEqual(app.focuses, []);
    assert.equal(nodes(app.render()).find(node => node.type === 'Button').props.disabled, false);
    app.hooks.unmount();
  });
}

for (const os of ['android', 'ios']) {
  for (const size of [5, 6]) {
    for (const keyEvent of ['before-change', 'after-change', 'none']) {
      test(`${os}, ${size} boxes: successive deletions return focus without tapping cells (${keyEvent})`, () => {
        const app = fixture(size, os);
        app.props.code = '012345'.slice(0, size).split('');
        // Reuse handlers to exercise rapid native events before a React rerender.
        const inputs = app.inputs();
        let focused = size - 1;
        for (let remaining = size - 1; remaining >= 0; remaining--) {
          assert.equal(focused, remaining);
          const input = inputs[focused];
          if (keyEvent === 'before-change') input.props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
          input.props.onChangeText('');
          if (keyEvent === 'after-change') input.props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
          assert.deepEqual(app.props.code, [
            ...'012345'.slice(0, remaining).split(''), ...Array(size - remaining).fill(''),
          ], 'each deletion clears only its own digit');
          focused = app.focuses.at(-1);
          assert.equal(focused, Math.max(0, remaining - 1));
        }
        inputs[0].props.onChangeText('9');
        assert.equal(app.props.code.join(''), '9');
        assert.equal(app.focuses.at(-1), 1, 'typing still advances after deleting the code');
        app.hooks.unmount();
      });
    }
  }

  test(`${os}: only one autofill target; native paste stays available in all boxes`, () => {
    const app = fixture(6, os), inputs = app.inputs();
    assert.equal(inputs[0].props.autoComplete, os === 'android' ? 'sms-otp' : 'one-time-code');
    assert.equal(inputs[0].props.textContentType, 'oneTimeCode');
    assert.equal(inputs[0].props.importantForAutofill, 'yes');
    for (const input of inputs.slice(1)) {
      assert.equal(input.props.autoComplete, 'off');
      assert.equal(input.props.textContentType, 'none');
      assert.equal(input.props.importantForAutofill, 'no');
    }
    for (const input of inputs) {
      assert.ok(input.props.maxLength > 12, 'spaces are not truncated before JS sanitization');
      assert.equal(input.props.contextMenuHidden, false);
      assert.equal(input.props.selectTextOnFocus, true);
    }
    app.hooks.unmount();
  });
}

test('compact OTP keeps exactly one paste action before the boxes and preserves explicit paste', async () => {
  const app = fixture(); app.props.compact = true; app.props.label = 'Code à 6 chiffres';
  const all = nodes(app.render());
  const paste = all.findIndex(node => node.type === 'Button');
  assert.equal(all.filter(node => node.type === 'Button').length, 1);
  assert.ok(paste < all.findIndex(node => node.type === 'Input'));
  assert.match(text(app.render()), /Code à 6 chiffres/);
  app.paste(); await tick();
  assert.equal(app.props.code.join(''), '012345');
  assert.deepEqual(app.focuses, []);
  app.hooks.unmount();
});

test('partial paste, deletion and backspace preserve other digits', () => {
  const app = fixture(); app.props.code = ['1', '2', '', '', '', ''];
  const inputs = app.inputs(); inputs[2].props.onChangeText('3 4');
  assert.deepEqual(app.props.code, ['1', '2', '3', '4', '', '']);
  assert.deepEqual(app.focuses, []);
  inputs[2].props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
  inputs[2].props.onChangeText('');
  assert.deepEqual(app.props.code, ['1', '2', '', '4', '', '']);
  assert.deepEqual(app.focuses, [1]); app.hooks.unmount();
});

test('backspace on empty boxes moves back without erasing adjacent digits or leaving the first box', () => {
  const app = fixture(); app.props.code = ['1', '2', '', '', '', ''];
  const inputs = app.inputs();
  inputs[2].props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
  assert.deepEqual(app.focuses, [1]);
  assert.deepEqual(app.props.code, ['1', '2', '', '', '', '']);
  inputs[1].props.onChangeText('');
  assert.deepEqual(app.focuses, [1, 0]);
  inputs[0].props.onChangeText('');
  inputs[0].props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
  assert.deepEqual(app.focuses, [1, 0]);
  assert.deepEqual(app.props.code, Array(6).fill(''));
  app.hooks.unmount();
});

test('unmounted inputs ignore late deletion and backspace events', () => {
  const app = fixture(); app.props.code = ['1', '2', '', '', '', ''];
  const inputs = app.inputs(); app.hooks.unmount();
  inputs[1].props.onChangeText('');
  inputs[2].props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
  assert.deepEqual(app.changes, []);
  assert.deepEqual(app.focuses, []);
});

test('empty/wrong clipboard content and read failure preserve input and show French guidance', async () => {
  for (const clipboard of [async () => '', async () => '123', async () => '1234567', async () => { throw Error('native clipboard error'); }]) {
    const app = fixture(); app.props.code = ['0', '1', '', '', '', '']; app.io.clipboard = clipboard;
    app.paste(); await tick();
    assert.deepEqual(app.props.code, ['0', '1', '', '', '', '']);
    assert.deepEqual(app.changes, []);
    assert.match(text(app.render()), /Copiez uniquement|Impossible de lire/);
    assert.doesNotMatch(text(app.render()), /native clipboard error/); app.hooks.unmount();
  }
});

test('late clipboard cannot overwrite typing, reset, resend or a closed screen', async () => {
  for (const change of ['typing', 'reset', 'resend', 'unmount']) {
    const app = fixture(), pending = deferred(); app.io.clipboard = () => pending.promise; app.paste();
    if (change === 'typing') app.inputs()[0].props.onChangeText('9');
    if (change === 'reset') { app.props.code = Array(6).fill(''); app.render(); }
    if (change === 'resend') { app.props.disabled = true; app.render(); app.props.disabled = false; app.render(); }
    if (change === 'unmount') app.hooks.unmount();
    pending.resolve('012345'); await tick();
    assert.equal(app.changes.length, change === 'typing' ? 1 : 0);
    assert.notEqual(app.props.code.join(''), '012345'); app.hooks.unmount();
  }
});

test('verification/resend disables native changes and explicit clipboard access', () => {
  const app = fixture(); app.props.code = ['0', '1', '', '', '', ''];
  const oldInputs = app.inputs(); app.props.disabled = true;
  assert.ok(app.inputs().every(node => node.props.editable === false));
  app.paste(); oldInputs[0].props.onChangeText('012345');
  oldInputs[1].props.onChangeText('');
  oldInputs[2].props.onKeyPress({ nativeEvent: { key: 'Backspace' } });
  assert.deepEqual(app.focuses, []);
  assert.deepEqual(app.changes, []); assert.deepEqual(app.reads, []); app.hooks.unmount();
});
