const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { projectCredit, parseProjectionFc, projectedDeduction } = loader()('features/pro-services/creditProjection.ts');
const base = { remainingMinor: 35000000, repaymentBps: 500, weeklyRevenueMinor: 10000000, weeklyExtraMinor: 0 };
test('credit projection uses only the repayment rate, not the commission, and caps the last payment', () => {
  const p = projectCredit(base);
  assert.equal(p.weeks, 70);
  assert.equal(p.weeklyMinor, 500000);
  assert.equal(p.checkpoints.at(-1).remainingMinor, 0);
  const accelerated = projectCredit({ ...base, weeklyExtraMinor: 250000 });
  assert.equal(accelerated.weeks, 47);
  assert.equal(accelerated.lastMinor, 500000);
  assert.equal((accelerated.weeks - 1) * accelerated.weeklyMinor + accelerated.lastMinor, base.remainingMinor);
});
test('no infinite loop, dates or invented debt for zero revenue, paid credits and huge durations', () => {
  assert.equal(projectCredit({ ...base, weeklyRevenueMinor: 0 }).weeks, null);
  assert.equal(projectCredit({ ...base, weeklyRevenueMinor: 0, weeklyExtraMinor: 35000000 }).weeks, 1);
  assert.equal(projectCredit({ ...base, remainingMinor: 0 }).weeks, 0);
  const tiny = projectCredit({ ...base, remainingMinor: 1e12, repaymentBps: 1, weeklyRevenueMinor: 100000 });
  assert.ok(tiny.checkpoints.length <= 5);
  assert.equal(tiny.weeks, 100000000000);
  assert.equal(tiny.checkpoints.at(-1).remainingMinor, 0);
  assert.equal(projectedDeduction(1e12, 9500), 950000000000);
});
test('invalid monetary values and percentages are rejected, never silently rounded up', () => {
  for (const [input, minor] of [['350 000', 35000000], ['0', 0], ['12,5', 1250], ['1e3', null], ['-1', null], ['', null], ['12.34', null]]) {
    assert.equal(parseProjectionFc(input), minor);
  }
  for (const rate of [0, 9501, undefined, NaN, 500.5]) assert.equal(projectCredit({ ...base, repaymentBps: rate }), null);
  for (const amount of [-1, Infinity, 1e13, 0.5]) assert.equal(projectCredit({ ...base, remainingMinor: amount }), null);
  assert.equal(projectedDeduction(199, 500), 0);
});
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
test('simulation is compact, editable, explicitly indicative and never calls a payment API', () => {
  const hooks = hookHarness();
  const { CreditCostPreview } = loader({ react: hooks.react,
    'react-native': { Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View' },
    '@/features/pro-services/ServiceLayout': { s: {} },
  })('features/pro-services/CreditCostPreview.tsx');
  const c = { id: 'test', principalMinor: '35000000', paidMinor: '0', status: 'offered',
    policyVersion: 'asset-credit-v2', repaymentBps: 500, totalRepaymentBps: 1250, commissionBps: 500 };
  const render = () => nodes(hooks.render(() => CreditCostPreview({ credit: c })));
  assert.equal(render().filter(n => n.type === 'Input').length, 0);
  render().find(n => n.type === 'Button').props.onPress();
  const revenue = () => render().find(n => n.props?.accessibilityLabel === 'Recettes de trajets par semaine en FC');
  revenue().props.onChangeText('100000');
  let text = render().filter(n => typeof n === 'string' || typeof n === 'number').join(' ');
  assert.match(text, /70/);
  assert.match(text, /ne remplacent pas les échéances minimums/);
  assert.match(text, /Aucun paiement/);
  c.policyVersion = 'asset-credit-v1';
  text = render().filter(n => typeof n === 'string').join(' ');
  assert.match(text, /ne peut pas être estimée/);
  assert.equal(render().filter(n => n.type === 'Input').length, 0);
  hooks.unmount();
});
