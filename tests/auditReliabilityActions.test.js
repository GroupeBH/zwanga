const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function reportFixture() {
  const hooks = hookHarness(), calls = [], dialogs = [], requests = [];
  const state = { active: true, version: 0 };
  const args = { scopeKey: 'actor:trip', tripId: 'trip', targetId: 'passenger', reason: 'rude', description: 'Description de test.',
    captureRatingSession: () => { const version = state.version; return {
      canUpdate: () => version === state.version, canPresent: () => state.active && version === state.version,
    }; } };
  const { useRatingReport } = loader({ react: hooks.react,
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/store/api/safetyApi': { useCreateUserReportMutation: () => [payload => {
      calls.push(payload); const request = deferred(); requests.push(request); return { unwrap: () => request.promise };
    }, { isLoading: false }] },
  })('hooks/rating/useRatingReport.ts');
  return { state, args, calls, requests, dialogs, hooks, render: () => hooks.render(() => useRatingReport(args)) };
}
test('report success requires server acknowledgement; rapid taps and same-render replay send once', async () => {
  const f = reportFixture(), action = f.render().handleSubmitReport;
  const task = action(); await action();
  assert.equal(f.calls.length, 1); assert.deepEqual(f.dialogs, []);
  assert.deepEqual(f.calls[0], { reportedUserId: 'passenger', tripId: 'trip', reason: 'inappropriate_behavior', description: 'Description de test.' });
  f.requests[0].resolve({ id: 'report' }); await task; await action();
  assert.equal(f.calls.length, 1); assert.equal(f.render().reportSent, true);
  assert.equal(f.dialogs[0].variant, 'success');
  f.hooks.unmount();
});
test('failed reports stay retryable and cannot falsely claim success', async () => {
  const f = reportFixture(); const task = f.render().handleSubmitReport();
  f.requests[0].reject({ status: 500 }); await task;
  assert.equal(f.dialogs[0].variant, 'danger'); assert.equal(f.render().reportSent, false);
  const retry = f.render().handleSubmitReport(); f.requests[1].resolve({}); await retry;
  assert.equal(f.render().reportSent, true); f.hooks.unmount();
});
test('reports validate target/details, ignore late UI and allow another selected participant', async () => {
  const f = reportFixture(); f.state.active = false;
  await f.render().handleSubmitReport(); assert.deepEqual(f.dialogs, []); assert.deepEqual(f.calls, []);
  f.state.active = true; f.args.description = 'short'; await f.render().handleSubmitReport();
  assert.equal(f.calls.length, 0); f.args.description = 'Description de test.';
  const task = f.render().handleSubmitReport(); f.state.active = false;
  f.requests[0].resolve({}); await task;
  assert.equal(f.dialogs.length, 1, 'only validation, no late success dialog');
  f.state.active = true; f.args.targetId = 'other-passenger';
  assert.equal(f.render().reportSent, false);
  const next = f.render().handleSubmitReport(); f.requests[1].resolve({}); await next;
  assert.equal(f.calls[1].reportedUserId, 'other-passenger'); f.hooks.unmount();
});

function transferFixture(disk = new Map()) {
  const hooks = hookHarness(), calls = [], requests = [], dialogs = [], edits = [];
  const state = { active: true, version: 0, storageFailure: false };
  let sequence = 0;
  const load = loader({ react: hooks.react, 'react-native': { Keyboard: { dismiss() {} } },
    '../../features/wallet/walletModel': { parsePositiveAmount: value => Number(value) > 0 ? Number(value) : null,
      resolveRecipientPayload: value => value ? { recipientEmail: value } : null, formatWalletAmount: value => String(value) },
    '@react-native-async-storage/async-storage': { getItem: async key => disk.get(key) ?? null,
      setItem: async (key, value) => { if (state.storageFailure) throw new Error('disk'); disk.set(key, value); },
      removeItem: async key => { disk.delete(key); } },
    'expo-crypto': { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
  });
  const args = { userId: 'sender', transferAmount: '5', transferRecipient: 'recipient@example.test', transferNote: '',
    captureScope: () => { const version = state.version; return () => state.active && version === state.version; },
    transferWalletPoints: payload => { calls.push(payload); const request = deferred(); requests.push(request); return { unwrap: () => request.promise }; },
    showDialog: value => dialogs.push(value), setTransferAmount: value => edits.push(value), setTransferRecipient: value => edits.push(value),
    setTransferNote: value => edits.push(value), setActiveModal: value => edits.push(value), refreshAll: async () => { throw new Error('refresh offline'); } };
  const { useWalletTransfer } = load('hooks/wallet/useWalletTransfer.ts');
  return { state, args, calls, requests, dialogs, edits, disk, hooks, load,
    render: () => hooks.render(() => useWalletTransfer(args)) };
}
test('transfer double taps issue one POST; a failed refresh cannot invalidate the receipt', async () => {
  const f = transferFixture(), action = f.render().handleTransfer;
  const task = action(); await action(); await flush();
  assert.equal(f.calls.length, 1); assert.ok(f.calls[0].idempotencyKey); assert.equal(f.disk.size, 1);
  f.requests[0].resolve({ amount: 5, currency: 'PTS', recipient: {} }); await task; await flush();
  assert.equal(f.disk.size, 0); assert.equal(f.dialogs.at(-1).variant, 'success'); f.hooks.unmount();
});
test('ambiguous transfer retains its durable key across hooks and refuses a different payment', async () => {
  const first = transferFixture(); const task = first.render().handleTransfer(); await flush();
  first.requests[0].reject({ status: 'TIMEOUT_ERROR' }); await task;
  const key = first.calls[0].idempotencyKey;
  assert.equal(first.disk.size, 1); assert.equal(first.dialogs.at(-1).title, 'Transfert à vérifier');
  first.hooks.unmount();
  const f = transferFixture(first.disk);
  f.args.transferAmount = '6'; await f.render().handleTransfer();
  assert.equal(f.calls.length, 0); assert.equal(f.dialogs.at(-1).title, 'Transfert à confirmer');
  f.args.transferAmount = '5'; const retry = f.render().handleTransfer(); await flush();
  assert.equal(f.calls[0].idempotencyKey, key);
  f.requests[0].resolve({ amount: 5, recipient: {} }); await retry; assert.equal(f.disk.size, 0);
  f.hooks.unmount();
});
test('storage failure prevents transfer; account change prevents old receipt UI', async () => {
  const f = transferFixture(); f.state.storageFailure = true;
  await f.render().handleTransfer(); assert.equal(f.calls.length, 0);
  f.state.storageFailure = false; const task = f.render().handleTransfer(); await flush();
  const count = f.dialogs.length; f.state.version++;
  f.requests[0].resolve({ amount: 5, recipient: {} }); await task;
  assert.equal(f.dialogs.length, count); f.hooks.unmount();
});
test('an authorization refusal during retry never drops a previously ambiguous transfer key', async () => {
  const f = transferFixture(), first = f.render().handleTransfer(); await flush();
  f.requests[0].reject({ status: 'TIMEOUT_ERROR' }); await first;
  const key = f.calls[0].idempotencyKey;
  const retry = f.render().handleTransfer(); await flush(); f.requests[1].reject({ status: 401 }); await retry;
  assert.equal(f.disk.size, 1);
  const recovered = f.render().handleTransfer(); await flush(); assert.equal(f.calls[2].idempotencyKey, key);
  f.requests[2].resolve({ amount: 5, recipient: {} }); await recovered;
  assert.equal(f.disk.size, 0); f.hooks.unmount();
});
