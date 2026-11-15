const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { hasValidCostDisclosure } = loader()('features/pro-services/creditCostDisclosure.ts');
const rows = [1, 2, 3, 4].map(ordinal => ({ ordinal, dueAt: null, amountMinor: 2500, remainingMinor: 2500 }));
const credit = { principalMinor: '10000', cashPriceMinor: '9000', creditFeeMinor: '1000',
  costDisclosureVersion: 'asset-credit-cost-v1', installmentCount: 4, installmentPeriod: 'week', installments: rows, minimumDueMinor: 0 };
const nodes = tree => tree == null || typeof tree === 'boolean' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
test('missing, malformed or future cost terms cannot silently pass the agreement gate', () => {
  assert.equal(hasValidCostDisclosure({ principalMinor: '10000' }), true);
  assert.equal(hasValidCostDisclosure(credit), true);
  for (const patch of [{ cashPriceMinor: null }, { creditFeeMinor: '2000' }, { costDisclosureVersion: 'future' },
    { installmentCount: 121 }, { installments: undefined }, { installments: rows.slice(1) }, { minimumDueMinor: -1 },
    { installments: rows.map(row => ({ ...row, dueAt: 'not-a-date' })) }])
    assert.equal(hasValidCostDisclosure({ ...credit, ...patch }), false);
});
test('cost breakdown shows first/last minimums then all dates without any payment action', () => {
  const hooks = hookHarness();
  const { CreditContractCosts } = loader({ react: hooks.react,
    'react-native': { Text: 'Text', TouchableOpacity: 'Button', View: 'View' },
    '@/features/pro-services/ServiceLayout': { s: {} },
  })('features/pro-services/CreditContractCosts.tsx');
  const render = () => nodes(hooks.render(() => CreditContractCosts({ credit })));
  const text = () => render().filter(n => typeof n === 'string' || typeof n === 'number').join(' ');
  assert.match(text(), /Prix du bien.*Frais de crédit inclus.*échéances minimums/);
  assert.match(text(), /1 semaine après remise.*4 semaines après remise/);
  assert.doesNotMatch(text(), /2 semaines après remise/);
  render().find(n => n.type === 'Button').props.onPress();
  assert.match(text(), /2 semaines après remise.*3 semaines après remise/);
  assert.match(text(), /Pas de double paiement/);
  hooks.unmount();
});
