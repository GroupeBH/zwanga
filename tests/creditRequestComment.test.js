const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = t => t == null || typeof t === 'boolean' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children)];
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const hooks = hookHarness(), calls = [];
  let enabled = true, session = 1, complete;
  const props = { request: { id: 'request-test', notes: 'Initial', assetKind: 'phone', status: 'submitted' }, scope: 'test-driver', enabled };
  const { CreditRequestComment } = loader({
    react: hooks.react,
    'react-native': { Text: 'Text', View: 'View', TextInput: 'Input' },
    '@/features/pro-services/ServiceLayout': { ServiceButton: 'Button', s: {} },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/store/api/assetCreditApi': { useUpdateCreditRequestCommentMutation: () => [dto => ({ unwrap: () => {
      calls.push(dto); return new Promise(resolve => { complete = resolve; });
    } }), { isLoading: false }] },
  })('features/pro-services/CreditRequestComment.tsx');
  const render = () => nodes(hooks.render(() => CreditRequestComment({ ...props, enabled })));
  return { render, props, calls, button: title => render().find(n => n.props?.title === title),
    resolve: () => complete(), background: () => { enabled = false; render(); }, logout: () => session++, close: () => hooks.unmount() };
}
test('credit request comment trims text, has a length limit and locks duplicate saves', async () => {
  const h = harness();
  h.button('Modifier mon commentaire').props.onPress();
  const input = h.render().find(n => n.type === 'Input');
  assert.equal(input.props.maxLength, 1000);
  input.props.onChangeText('  Message synthétique  ');
  const save = h.button('Enregistrer le commentaire');
  save.props.onPress(); save.props.onPress();
  assert.deepEqual(h.calls, [{ id: 'request-test', notes: 'Message synthétique' }]);
  h.resolve(); await tick();
  assert.ok(h.render().includes('Commentaire enregistré.'));
  assert.ok(!h.render().some(n => n.type === 'Input'));
  h.close();
});
test('background, logout and offer issuance prevent stale comment UI or mutations', async () => {
  for (const interrupt of ['background', 'logout']) {
    const h = harness(); h.button('Modifier mon commentaire').props.onPress();
    h.button('Enregistrer le commentaire').props.onPress(); h[interrupt](); h.resolve(); await tick();
    assert.ok(!h.render().includes('Commentaire enregistré.')); h.close();
  }
  const h = harness(); h.button('Modifier mon commentaire').props.onPress(); h.props.request.status = 'offered';
  h.button('Enregistrer le commentaire').props.onPress(); assert.equal(h.calls.length, 0);
  h.background(); assert.equal(h.button('Enregistrer le commentaire').props.disabled, true); h.close();
});
