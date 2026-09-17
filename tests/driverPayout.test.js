const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const settle = () => new Promise(resolve => setImmediate(resolve));
const summary = { availableBalance: 9500, minimumPayoutAmount: 1, payoutPhone: '0891234567', kycApproved: true, currency: 'CDF' };

function fixture() {
  const storage = new Map();
  const events = [];
  const dialogs = [];
  const calls = [];
  const checks = [];
  let owner = 'driver-A';
  let uuid = 0;
  let rejectStorage = false;
  let respond = async body => ({ id: 'payout-A', status: 'initiated', orderNumber: 'ORDER-A', ...body });
  let statusResponse = { id: 'payout-A', status: 'succeeded', amount: 9500, phone: '+243891234567' };
  const harness = hookHarness();
  const load = loader({
    react: harness.react,
    '@react-native-async-storage/async-storage': {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { if (rejectStorage) throw new Error('storage unavailable'); events.push('persist'); storage.set(key, value); },
      removeItem: async key => storage.delete(key),
    },
    'expo-crypto': { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    '@/store/hooks': { useAppSelector: selector => selector() },
    '@/store/selectors': { selectUser: () => owner ? { id: owner } : null },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/store/api/driverSettlementsApi': {
      useRequestDriverPayoutMutation: () => [body => {
        events.push('post'); calls.push(body);
        return { unwrap: () => respond(body) };
      }],
      useLazyCheckDriverPayoutStatusQuery: () => [(order, preferCache) => {
        checks.push({ order, preferCache }); return { unwrap: async () => statusResponse };
      }],
    },
  });
  const { useDriverPayout } = load('hooks/driver-earnings/useDriverPayout.ts');
  const props = { summary, payouts: [], refresh: async () => {} };
  return {
    storage, events, dialogs, calls, checks, props, harness, load,
    render: () => harness.render(() => useDriverPayout(props)),
    setOwner: value => { owner = value; },
    setResponder: value => { respond = value; },
    setStatus: value => { statusResponse = value; },
    blockStorage: () => { rejectStorage = true; },
  };
}

async function ready(f) { f.render(); await settle(); return f.render(); }
function confirm(f, view) { view.handlePayout(); return f.dialogs.at(-1).actions.at(-1).onPress(); }

test('payout recipient phone accepts local and international forms, rejects invalid forms', () => {
  const { normalizePayoutPhone } = fixture().load('features/driver-earnings/payoutModel.ts');
  for (const phone of ['0891234567', '243891234567', '+243891234567', '00243891234567', '+243 891 234 567']) assert.equal(normalizePayoutPhone(phone), '+243891234567');
  for (const phone of ['', 'phone0891234567', '+33123456789', '123']) assert.equal(normalizePayoutPhone(phone), null);
});

test('failed and uncertain responses never appear as successful transfers or demand a driver payment', () => {
  const { getPayoutMessage, getPayoutErrorMessage } = fixture().load('features/driver-earnings/payoutModel.ts');
  assert.match(getPayoutMessage({ status: 'failed', paymentMessage: 'Insufficient merchant balance' }), /Zwanga ne peut/);
  assert.match(getPayoutMessage({ status: 'failed', paymentMessage: 'SQLSTATE failed internal server error' }), /n’a pas abouti/);
  assert.match(getPayoutMessage({ status: 'pending' }), /reste réservé/);
  assert.match(getPayoutMessage({ status: 'initiated', orderNumber: 'ORDER' }), /Aucun paiement/);
  assert.match(getPayoutErrorMessage({ status: 'TIMEOUT_ERROR' }), /même demande/);
  assert.match(getPayoutErrorMessage({ status: 400, data: { message: 'FLEXPAY_TOKEN is not configured' } }), /service de versement Zwanga/);
});

test('persists before POST, uses normalized recipient, announces merchant-to-driver flow', async () => {
  const f = fixture();
  await confirm(f, await ready(f));
  assert.deepEqual(f.events, ['persist', 'post']);
  assert.equal(f.calls[0].phone, '+243891234567');
  assert.match(f.dialogs[0].message, /depuis son compte marchand/);
  assert.equal(f.dialogs.at(-1).title, 'Versement en cours');
  assert.equal(f.storage.size, 0);
});

test('double confirmation cannot initiate two payouts', async () => {
  const f = fixture();
  const view = await ready(f);
  view.handlePayout();
  const action = f.dialogs.at(-1).actions.at(-1).onPress;
  await Promise.all([action(), action()]);
  await action();
  assert.equal(f.calls.length, 1);
});

test('timeout retains the same key and checking reuses the exact amount even with balance zero', async () => {
  const f = fixture();
  f.setResponder(async () => { throw { status: 'TIMEOUT_ERROR' }; });
  await confirm(f, await ready(f));
  assert.equal(f.storage.size, 1);
  const original = f.calls[0];
  f.props.summary = { ...summary, availableBalance: 0 };
  const resumed = f.render();
  assert.equal(resumed.canSubmit, true);
  assert.equal(resumed.hasUnconfirmedIntent, true);
  f.setResponder(async body => ({ ...body, id: 'payout-A', status: 'initiated', orderNumber: 'ORDER' }));
  await confirm(f, resumed);
  assert.deepEqual(f.calls[1], original);
  assert.equal(f.storage.size, 0);
});

test('a known failed response clears the intent and shows failure, never transmitted', async () => {
  const f = fixture();
  f.setResponder(async body => ({ ...body, id: 'payout-A', status: 'failed', paymentMessage: 'Insufficient merchant balance' }));
  await confirm(f, await ready(f));
  assert.equal(f.dialogs.at(-1).title, 'Versement non effectué');
  assert.match(f.dialogs.at(-1).message, /gains sont conservés/);
  assert.equal(f.storage.size, 0);
});

test('restores an existing intent without an automatic POST', async () => {
  const f = fixture();
  const store = f.load('services/driverPayoutIntent.ts');
  const saved = await store.prepareDriverPayoutIntent('driver-A', 5000, '+243891234567');
  const view = await ready(f);
  assert.equal(view.hasUnconfirmedIntent, true);
  assert.equal(f.calls.length, 0);
  await confirm(f, view);
  assert.equal(f.calls[0].idempotencyKey, saved.idempotencyKey);
  assert.equal(f.calls[0].amount, 5000);
});

test('429 on a restored uncertain request never discards the original key', async () => {
  const f = fixture();
  await f.load('services/driverPayoutIntent.ts').prepareDriverPayoutIntent('driver-A', 5000, '+243891234567');
  f.setResponder(async () => { throw { status: 429 }; });
  await confirm(f, await ready(f));
  assert.equal(f.storage.size, 1);
});

test('storage failure prevents the POST', async () => {
  const f = fixture();
  const view = await ready(f);
  f.blockStorage();
  await confirm(f, view);
  assert.equal(f.calls.length, 0);
  assert.equal(f.render().canSubmit, false);
});

test('server history reconciles an intent after a lost response without another POST', async () => {
  const f = fixture();
  const saved = await f.load('services/driverPayoutIntent.ts').prepareDriverPayoutIntent('driver-A', 5000, '+243891234567');
  await ready(f);
  f.props.payouts = [{ id: 'payout-A', idempotencyKey: saved.idempotencyKey, status: 'pending' }];
  f.render(); await settle();
  assert.equal(f.storage.size, 0);
  assert.equal(f.render().hasUnconfirmedIntent, false);
  assert.equal(f.calls.length, 0);
});

test('changing accounts never sends another driver’s restored request', async () => {
  const f = fixture();
  await f.load('services/driverPayoutIntent.ts').prepareDriverPayoutIntent('driver-A', 5000, '+243891234567');
  const view = await ready(f);
  view.handlePayout();
  const oldAction = f.dialogs.at(-1).actions.at(-1).onPress;
  f.setOwner('driver-B'); f.render(); await settle();
  assert.equal(f.render().hasUnconfirmedIntent, false);
  await oldAction();
  assert.equal(f.calls.length, 0);
  assert.equal(f.storage.size, 1);
});

test('manual status check uses RTK Query without launching a transfer', async () => {
  const f = fixture();
  await (await ready(f)).checkPayout({ id: 'payout-A', status: 'pending', orderNumber: 'ORDER-A' });
  assert.deepEqual(f.checks, [{ order: 'ORDER-A', preferCache: false }]);
  assert.equal(f.calls.length, 0);
  assert.equal(f.dialogs.at(-1).title, 'Gains versés');
});

test('pending without order number offers review, never a blind transfer retry', async () => {
  const f = fixture();
  await (await ready(f)).checkPayout({ id: 'payout-A', status: 'pending', orderNumber: null, reference: 'REF-A' });
  assert.equal(f.checks.length, 0);
  assert.equal(f.calls.length, 0);
  assert.match(f.dialogs.at(-1).message, /assistance/);
  assert.match(f.dialogs.at(-1).message, /REF-A/);
});

test('concurrent intent preparation returns one stable key per account', async () => {
  const f = fixture();
  const { prepareDriverPayoutIntent } = f.load('services/driverPayoutIntent.ts');
  const [a, b] = await Promise.all([prepareDriverPayoutIntent('driver-A', 5000, '+243891234567'), prepareDriverPayoutIntent('driver-A', 5000, '+243891234567')]);
  assert.deepEqual(a, b);
  assert.equal(f.storage.size, 1);
});

test('unmount prevents an old confirmation from submitting', async () => {
  const f = fixture();
  (await ready(f)).handlePayout();
  const action = f.dialogs.at(-1).actions.at(-1).onPress;
  f.harness.unmount();
  await action();
  assert.equal(f.calls.length, 0);
});

test('a late response after unmount does not open a dialog on another screen', async () => {
  const f = fixture();
  let finish;
  f.setResponder(body => new Promise(resolve => { finish = () => resolve({ ...body, id: 'payout-A', status: 'succeeded' }); }));
  const submitting = confirm(f, await ready(f));
  await settle();
  assert.equal(f.calls.length, 1);
  f.harness.unmount();
  finish();
  await submitting;
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.storage.size, 0);
});

test('recipient form starts with the profile number without launching or preparing any transfer', async () => {
  const f = fixture();
  (await ready(f)).openPayoutForm();
  assert.deepEqual(f.render().payoutForm, { userId: 'driver-A', amount: 9500, phone: '+243891234567' });
  assert.equal(f.storage.size, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.dialogs.length, 0);
});

test('another recipient is displayed in full, persisted and sent without changing the profile', async () => {
  const f = fixture();
  (await ready(f)).openPayoutForm();
  f.render().setPayoutPhone('099 123 45 67');
  f.render().confirmPayoutForm();
  assert.equal(f.render().payoutForm, null);
  assert.equal(f.calls.length, 0);
  assert.match(f.dialogs.at(-1).message, /\+243991234567/);
  assert.doesNotMatch(f.dialogs.at(-1).message, /•••/);
  await f.dialogs.at(-1).actions.at(-1).onPress();
  assert.equal(f.calls[0].phone, '+243991234567');
  assert.equal(f.calls[0].amount, 9500);
  assert.deepEqual(f.events, ['persist', 'post']);
  assert.equal(f.props.summary.payoutPhone, '0891234567');
});

test('empty or invalid recipients never silently fall back to the profile', async () => {
  for (const phone of ['', '123', '+33123456789', 'phone0891234567']) {
    const f = fixture();
    (await ready(f)).openPayoutForm();
    f.render().setPayoutPhone(phone);
    f.render().confirmPayoutForm();
    assert.equal(f.dialogs.at(-1).title, 'Numéro Mobile Money à vérifier');
    assert.equal(f.calls.length, 0);
    assert.equal(f.storage.size, 0);
  }
});

test('a missing profile phone no longer blocks choosing a payout recipient', async () => {
  const f = fixture(); f.props.summary = { ...summary, payoutPhone: null };
  (await ready(f)).openPayoutForm();
  assert.equal(f.render().payoutForm.phone, '');
  f.render().setPayoutPhone('0991234567');
  f.render().confirmPayoutForm();
  await f.dialogs.at(-1).actions.at(-1).onPress();
  assert.equal(f.calls[0].phone, '+243991234567');
  assert.equal(f.props.summary.payoutPhone, null);
});

test('closing the form cancels without a POST and reopening restores the default number', async () => {
  const f = fixture(); (await ready(f)).openPayoutForm();
  f.render().setPayoutPhone('0991234567');
  const previous = f.render(); previous.closePayoutForm(); previous.confirmPayoutForm();
  assert.equal(f.dialogs.length, 0);
  assert.equal(f.calls.length, 0);
  f.render().openPayoutForm();
  assert.equal(f.render().payoutForm.phone, '+243891234567');
});

test('refreshing revenues preserves an edited recipient and rejects a no-longer-available amount', async () => {
  const f = fixture(); (await ready(f)).openPayoutForm();
  f.render().setPayoutPhone('0991234567');
  f.props.summary = { ...summary };
  assert.equal(f.render().payoutForm.phone, '0991234567');
  f.props.summary = { ...summary, availableBalance: 5000 };
  f.render().confirmPayoutForm();
  assert.equal(f.dialogs.at(-1).title, 'Montant indisponible');
  assert.equal(f.calls.length, 0);
});

test('retrying a failed payout keeps its amount but can choose a new recipient', async () => {
  const f = fixture();
  f.setResponder(async body => ({ ...body, status: 'failed' }));
  await confirm(f, await ready(f));
  f.setResponder(async body => ({ ...body, status: 'initiated', orderNumber: 'ORDER-B' }));
  f.render().openPayoutForm(5000); f.render().setPayoutPhone('0991234567');
  f.render().confirmPayoutForm(); await f.dialogs.at(-1).actions.at(-1).onPress();
  assert.equal(f.calls[1].amount, 5000);
  assert.equal(f.calls[1].phone, '+243991234567');
  assert.notEqual(f.calls[1].idempotencyKey, f.calls[0].idempotencyKey);
});

test('an uncertain custom-recipient payout stays locked to its original phone, amount and key', async () => {
  const f = fixture(); f.setResponder(async () => { throw { status: 'TIMEOUT_ERROR' }; });
  (await ready(f)).openPayoutForm(); f.render().setPayoutPhone('0991234567');
  f.render().confirmPayoutForm(); await f.dialogs.at(-1).actions.at(-1).onPress();
  const original = f.calls[0];
  f.render().openPayoutForm();
  assert.equal(f.render().payoutForm, null);
  assert.match(f.dialogs.at(-1).message, /numéro ne peut pas être changé/);
  f.render().handlePayout(1, '+243811111111');
  await f.dialogs.at(-1).actions.at(-1).onPress();
  assert.deepEqual(f.calls[1], original);
});

test('double continue opens only one confirmation and cancellation never sends a payout', async () => {
  const f = fixture(); (await ready(f)).openPayoutForm();
  const form = f.render(); form.confirmPayoutForm(); form.confirmPayoutForm();
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.dialogs[0].actions[0].label, 'Annuler');
  assert.equal(f.dialogs[0].actions[0].onPress, undefined);
  assert.equal(f.calls.length, 0);
});

test('identity checks are still required before choosing a recipient', async () => {
  const f = fixture(); f.props.summary = { ...summary, kycApproved: false };
  (await ready(f)).openPayoutForm();
  assert.equal(f.render().payoutForm, null);
  assert.equal(f.dialogs.at(-1).title, 'Vérification d’identité requise');
  assert.equal(f.calls.length, 0);
});

test('leaving the screen or changing accounts discards the recipient draft and blocks stale actions', async () => {
  for (const accountChange of [false, true]) {
    const f = fixture(); (await ready(f)).openPayoutForm();
    f.render().setPayoutPhone('0991234567');
    const oldForm = f.render();
    if (accountChange) f.setOwner('driver-B'); else f.props.isActive = false;
    f.render(); await settle();
    assert.equal(f.render().payoutForm, null);
    oldForm.confirmPayoutForm(); oldForm.openPayoutForm();
    assert.equal(f.calls.length, 0);
    assert.equal(f.dialogs.length, 0);
    assert.equal(f.render().payoutForm, null);
  }
});

test('a confirmation cannot send after the screen becomes inactive', async () => {
  const f = fixture(); (await ready(f)).openPayoutForm();
  f.render().confirmPayoutForm();
  const action = f.dialogs.at(-1).actions.at(-1).onPress;
  f.props.isActive = false; f.render(); await action();
  assert.equal(f.calls.length, 0);
});

test('restoring a custom recipient after restart bypasses editing and keeps the saved destination', async () => {
  const f = fixture();
  const saved = await f.load('services/driverPayoutIntent.ts').prepareDriverPayoutIntent('driver-A', 5000, '+243991234567');
  (await ready(f)).openPayoutForm();
  assert.equal(f.render().payoutForm, null);
  assert.match(f.dialogs.at(-1).message, /\+243991234567/);
  await f.dialogs.at(-1).actions.at(-1).onPress();
  assert.deepEqual(f.calls[0], { amount: saved.amount, phone: saved.phone, idempotencyKey: saved.idempotencyKey });
});

test('a timeout received in the background keeps the chosen recipient for verification on return', async () => {
  const f = fixture(); let finish;
  f.setResponder(() => new Promise((resolve, reject) => { finish = () => reject({ status: 'TIMEOUT_ERROR' }); }));
  (await ready(f)).openPayoutForm(); f.render().setPayoutPhone('0991234567');
  f.render().confirmPayoutForm();
  const submitting = f.dialogs.at(-1).actions.at(-1).onPress(); await settle();
  f.props.isActive = false; f.render(); finish(); await submitting;
  assert.equal(f.storage.size, 1);
  assert.equal(f.dialogs.length, 1);
  f.props.isActive = true; f.render().openPayoutForm();
  assert.equal(f.render().payoutForm, null);
  assert.match(f.dialogs.at(-1).message, /\+243991234567/);
  assert.equal(f.calls.length, 1);
});
