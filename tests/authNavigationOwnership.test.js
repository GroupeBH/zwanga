const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

for (const step of ['pin', 'profile', 'kyc']) {
  test(`auth ${step}: the form helper never races the screen's session redirect`, async () => {
    const hooks = hookHarness(), redirects = [], tasks = [];
    const load = loader({
      react: hooks.react,
      'react-native': { Platform: { OS: 'android' }, InteractionManager: {
        runAfterInteractions: () => { const task = { cancel() {} }; tasks.push(task); return task; },
      } },
      '@/services/authFlowDraft': { getAuthDraftSnapshot: () => null },
      '@/utils/referralAttribution': { getPendingReferralAttribution: async () => null },
    });
    const { useAuthFormNavigation } = load('hooks/auth/useAuthFormNavigation.ts');
    const params = {
      step, isAuthenticated: false, router: { replace: path => redirects.push(path) },
      focusInteractionRef: { current: null }, focusTimeoutRef: { current: null },
      smsInputRefs: { current: [] }, pinInputRef: { current: null }, googleOtpRefs: { current: [] },
      setReferralAttribution() {}, setMode() {},
    };
    hooks.render(() => useAuthFormNavigation(params));
    params.isAuthenticated = true;
    hooks.render(() => useAuthFormNavigation(params));
    await Promise.resolve();
    assert.deepEqual(redirects, []);
    assert.equal(tasks.length, step === 'pin' ? 1 : 0, 'PIN focus remains scheduled once');
    hooks.unmount();
  });
}

test('the auth screen retains its single declarative redirect and the KYC exception', () => {
  const source = fs.readFileSync('app/auth.tsx', 'utf8');
  assert.match(source, /isAuthenticated && form\.step !== 'kyc'.*<Redirect href="\/\(tabs\)"/);
});
