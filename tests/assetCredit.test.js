const test = require("node:test");
const assert = require("node:assert/strict");
const { loader } = require("./helpers/loadTypeScript.cjs");
const { hookHarness } = require("./helpers/hookHarness.cjs");
const model = loader()("features/pro-services/assetCreditModel.ts");
const nodes = (tree) =>
  tree == null || typeof tree === "boolean"
    ? []
    : Array.isArray(tree)
      ? tree.flatMap(nodes)
      : [tree, ...nodes(tree.props?.children)];
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("money input never rounds fractional or malformed repayments up", () => {
  for (const [input, expected] of [
    ["500", 50000],
    ["500,5", 50050],
    ["0.1", 10],
    ["0", null],
    ["-2", null],
    ["12.34", null],
    ["1e3", null],
    ["", null],
  ])
    assert.equal(model.repaymentMinor(input), expected);
  assert.equal(model.definitiveRepaymentFailure({ status: 409 }), true);
  for (const status of ["FETCH_ERROR", "TIMEOUT_ERROR", 500, 502])
    assert.equal(model.definitiveRepaymentFailure({ status }), false);
});
function harness({
  disk = new Map(),
  attempts = [],
  uncertain = false,
  status = "active",
  active = true,
  save = async () => {},
} = {}) {
  const hooks = hookHarness();
  let reject = uncertain;
  let session = 1;
  let foreground = active;
  const c = {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Téléphone test",
    status,
    terms: "Conditions test",
    policyVersion: "asset-credit-v1",
    principalMinor: "100000",
    paidMinor: "0",
    dueMinor: "0",
    entries: [],
  };
  const decisions = [];
  const { default: Screen } = loader({
    '@expo/vector-icons': { Ionicons: 'Icon' },
    react: hooks.react,
    "react-native": {
      Text: "Text",
      TextInput: "Input",
      TouchableOpacity: "Check",
      View: "View",
      ActivityIndicator: "Loading",
    },
    "expo-router": { useLocalSearchParams: () => ({ id: c.id }) },
    "expo-crypto": { randomUUID: () => "22222222-2222-4222-8222-222222222222" },
    "@react-native-async-storage/async-storage": {
      getItem: async (k) => disk.get(k) ?? null,
      setItem: async (k, v) => {
        disk.set(k, v);
        await save();
      },
      removeItem: async (k) => {
        disk.delete(k);
      },
    },
    "@/hooks/useAppIsActive": { useScreenIsActive: () => foreground },
    "@/store/hooks": { useAppSelector: (select) => select() },
    "@/store/selectors": { selectUser: () => ({ id: "test-driver" }) },
    "@/services/tokenSession": { getTokenSessionVersion: () => session },
    "@/features/pro-services/ServiceLayout": {
      ServiceLayout: "Layout",
      ServiceButton: "Button",
      s: {},
    },
    "@/store/api/assetCreditApi": {
      useGetAssetCreditQuery: () => ({ data: c }),
      useDecideAssetCreditMutation: () => [
        (dto) => ({
          unwrap: async () => {
            decisions.push(dto);
          },
        }),
        { isLoading: false },
      ],
      useRepayAssetCreditMutation: () => [
        (dto) => ({
          unwrap: async () => {
            attempts.push(dto);
            assert.equal(disk.size, 1, "intent saved before sending");
            if (reject) {
              reject = false;
              throw { status: "TIMEOUT_ERROR" };
            }
            return { id: c.id };
          },
        }),
        { isLoading: false },
      ],
    },
  })("app/services/credit/[id].tsx");
  const render = () => nodes(hooks.render(() => Screen()));
  return {
    credit: c,
    render,
    unmount: () => hooks.unmount(),
    disk,
    attempts,
    decisions,
    background: () => {
      foreground = false;
      render();
    },
    logout: () => {
      session++;
    },
  };
}

test('new contracts show their individual rate and cumulative total before explicit consent', async () => {
  const h = harness({ status: 'offered' });
  Object.assign(h.credit, { policyVersion: 'asset-credit-v2', repaymentBps: 750, totalRepaymentBps: 2250, commissionBps: 500 });
  h.render(); await tick();
  let tree = h.render();
  tree.find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  await h.render().find(n => n.props?.title === 'Accepter le contrat').props.onPress();
  assert.equal(h.decisions[0].expectedTotalRepaymentBps, 2250);
  assert.equal(h.decisions[0].policyVersion, 'asset-credit-v2');
  h.unmount();
});

test('changed totals clear consent; invalid or missing rates cannot be accepted', async () => {
  const h = harness({ status: 'offered' });
  Object.assign(h.credit, { policyVersion: 'asset-credit-v2', repaymentBps: 500, totalRepaymentBps: 500, commissionBps: 500 });
  h.render(); await tick();
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  h.credit.totalRepaymentBps = 1500;
  h.render();
  assert.equal(h.render().find(n => n.props?.title === 'Accepter le contrat').props.disabled, true);
  for (const total of [undefined, NaN, -1, 100, 9501]) {
    h.credit.totalRepaymentBps = total;
    h.render(); h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
    const action = h.render().find(n => n.props?.title === 'Accepter le contrat');
    assert.equal(action.props.disabled, true);
    await action.props.onPress();
  }
  assert.equal(h.decisions.length, 0);
  h.unmount();
});

test('repayment summary distinguishes the credit rate, all credits, and commission', () => {
  const { CreditRepaymentSummary } = loader({
    'react-native': { View: 'View', Text: 'Text' },
    '@/features/pro-services/ServiceLayout': { s: {} },
  })('features/pro-services/CreditRepaymentSummary.tsx');
  const credit = { status: 'offered', policyVersion: 'asset-credit-v2', repaymentBps: 750, totalRepaymentBps: 2250, commissionBps: 500 };
  const text = nodes(CreditRepaymentSummary({ credit })).filter(n => typeof n === 'string').join(' ');
  assert.match(text, /7,5 %/); assert.match(text, /22,5 %/); assert.match(text, /27,5 %/);
  assert.equal(CreditRepaymentSummary({ credit: { ...credit, status: 'settled', totalRepaymentBps: 0 } }), null);
});

test('new cost disclosure requires complete terms, resets consent on change and acknowledges its version', async () => {
  const h = harness({ status: 'offered' });
  Object.assign(h.credit, { policyVersion: 'asset-credit-v2', repaymentBps: 500, totalRepaymentBps: 500, commissionBps: 500,
    cashPriceMinor: '90000', creditFeeMinor: '10000', costDisclosureVersion: 'asset-credit-cost-v1' });
  h.render(); await tick();
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  h.credit.creditFeeMinor = '11000'; h.render();
  assert.equal(h.render().find(n => n.props?.title === 'Accepter le contrat').props.disabled, true);
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  await h.render().find(n => n.props?.title === 'Accepter le contrat').props.onPress();
  assert.equal(h.decisions.length, 0, 'inconsistent totals cannot be consented to');
  h.credit.creditFeeMinor = '10000'; h.render();
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  await h.render().find(n => n.props?.title === 'Accepter le contrat').props.onPress();
  assert.equal(h.decisions[0].costDisclosureVersion, 'asset-credit-cost-v1');
  h.unmount();
});

test('monthly plan must be selected before consent; changing it requires fresh agreement', async () => {
  const h = harness({ status: 'offered' });
  const preview = months => ({ id: `m${months}`, months, minimumDueMinor: 0,
    installments: Array.from({ length: months }, (_, i) => ({ ordinal: i+1, dueAt: null, amountMinor: 100000/months, remainingMinor: 100000/months })) });
  Object.assign(h.credit, { cashPriceMinor: '90000', creditFeeMinor: '10000', costDisclosureVersion: 'asset-credit-cost-v1',
    repaymentPlans: [{ id: 'm2', months: 2 }, { id: 'm4', months: 4 }], repaymentPlanPreviews: [preview(2), preview(4)] });
  h.render(); await tick();
  const accept = () => h.render().find(n => n.props?.title === 'Accepter le contrat');
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  assert.equal(accept().props.disabled, true); await accept().props.onPress(); assert.equal(h.decisions.length, 0);
  const select = value => h.render().find(n => typeof n.type === 'function' && n.type.name === 'CreditPlanChoice').props.onSelect(value);
  select('m2'); h.render(); h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  assert.equal(accept().props.disabled, false);
  select('m4'); assert.equal(accept().props.disabled, true);
  h.render().find(n => n.props?.accessibilityRole === 'checkbox').props.onPress();
  await accept().props.onPress(); assert.equal(h.decisions[0].selectedPlanId, 'm4'); assert.equal(h.attempts.length, 0);
  h.unmount();
});
test("leaving or changing session during intent persistence never sends a new debit", async () => {
  for (const transition of ["background", "logout", "unmount"]) {
    let release;
    const h = harness({
      save: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    h.render();
    await tick();
    h.render()
      .find((n) => n.type === "Input")
      .props.onChangeText("500");
    h.render()
      .find((n) => n.props?.title === "Rembourser")
      .props.onPress();
    const payment = h
      .render()
      .find((n) => n.props?.title === "Confirmer le remboursement")
      .props.onPress();
    await tick();
    h[transition]();
    release();
    await payment;
    assert.equal(h.attempts.length, 0, transition);
    assert.equal(h.disk.size, 1, "same intent can be resumed safely");
    h.unmount();
  }
});
test("repayment requires explicit confirmation and guards double taps", async () => {
  const h = harness();
  h.render();
  await tick();
  let tree = h.render();
  tree.find((n) => n.type === "Input").props.onChangeText("500");
  tree = h.render();
  tree.find((n) => n.props?.title === "Rembourser").props.onPress();
  assert.equal(h.attempts.length, 0);
  tree = h.render();
  const pay = tree.find((n) => n.props?.title === "Confirmer le remboursement");
  await Promise.all([pay.props.onPress(), pay.props.onPress()]);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].amountMinor, 50000);
  assert.equal(h.disk.size, 0);
  h.unmount();
});
test("uncertain network payment survives closing and reopening, retaining the operation ID", async () => {
  const disk = new Map(),
    attempts = [];
  const first = harness({ disk, attempts, uncertain: true });
  first.render();
  await tick();
  first
    .render()
    .find((n) => n.type === "Input")
    .props.onChangeText("500");
  first
    .render()
    .find((n) => n.props?.title === "Rembourser")
    .props.onPress();
  await first
    .render()
    .find((n) => n.props?.title === "Confirmer le remboursement")
    .props.onPress();
  assert.equal(disk.size, 1);
  first.unmount();
  const second = harness({ disk, attempts });
  second.render();
  await tick();
  const tree = second.render();
  assert.equal(tree.filter((n) => n.type === "Input").length, 0);
  await tree
    .find((n) => n.props?.title === "Vérifier ce remboursement")
    .props.onPress();
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(disk.size, 0);
  second.unmount();
});
test("contract cannot be accepted through the button without checked consent; no payment on offered credit", async () => {
  const h = harness({ status: "offered" });
  h.render();
  await tick();
  let tree = h.render();
  assert.equal(
    tree.find((n) => n.props?.title === "Accepter le contrat").props.disabled,
    true,
  );
  assert.equal(tree.filter((n) => n.props?.title === "Rembourser").length, 0);
  tree.find((n) => n.props?.accessibilityRole === "checkbox").props.onPress();
  tree = h.render();
  assert.equal(
    tree.find((n) => n.props?.title === "Accepter le contrat").props.disabled,
    false,
  );
  await tree
    .find((n) => n.props?.title === "Accepter le contrat")
    .props.onPress();
  assert.equal(h.decisions[0].policyVersion, "asset-credit-v1");
  h.unmount();
});
test("API mutations use authenticated base query and invalidate balances only on repayment", () => {
  const identity = (x) => x;
  let endpoints;
  loader({
    "./baseApi": {
      baseApi: {
        injectEndpoints: ({ endpoints: factory }) => {
          endpoints = factory({ query: identity, mutation: identity });
          return {};
        },
      },
    },
  })("store/api/assetCreditApi.ts");
  assert.deepEqual(
    endpoints.repayAssetCredit.query({
      id: "c",
      amountMinor: 50000,
      mutationId: "m",
    }).body,
    { amountMinor: 50000, mutationId: "m" },
  );
  assert.ok(endpoints.repayAssetCredit.invalidatesTags.includes("Wallet"));
  assert.equal(endpoints.getAssetCreditProducts.query(), '/asset-credits/products');
  for (const assetKind of ['phone', 'helmet', 'gps_tracker', 'delivery_equipment', 'equipment']) {
    assert.deepEqual(endpoints.requestAssetCredit.query({ assetKind, notes: 'test' }).body, { assetKind, notes: 'test' });
  }
  assert.equal(
    endpoints.decideAssetCredit.query({
      id: "c",
      accept: false,
      policyVersion: "v",
    }).body,
    undefined,
  );
});
