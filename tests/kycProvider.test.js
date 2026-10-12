const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function provider(flag) {
  const previous = process.env.EXPO_PUBLIC_AWS_KYC_ENABLED;
  try {
    if (flag === undefined) delete process.env.EXPO_PUBLIC_AWS_KYC_ENABLED;
    else process.env.EXPO_PUBLIC_AWS_KYC_ENABLED = flag;
    return loader()('features/identity/kycProvider.ts');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_AWS_KYC_ENABLED;
    else process.env.EXPO_PUBLIC_AWS_KYC_ENABLED = previous;
  }
}

test('Didit is the default and never queries AWS, even if the server would enable it', async () => {
  for (const flag of [undefined, 'false', '', '1', 'TRUE']) {
    const policy = provider(flag);
    let calls = 0;
    assert.equal(policy.AWS_KYC_MOBILE_ENABLED, false);
    assert.equal(await policy.shouldStartAwsKyc(async () => { calls++; return { enabled: true }; }), false);
    assert.equal(await policy.shouldStartAwsKyc(async () => { calls++; throw new Error('AWS unavailable'); }), false);
    assert.equal(calls, 0);
  }
});

test('future activation requires both an explicit mobile flag and backend approval', async () => {
  const policy = provider('true');
  assert.equal(policy.AWS_KYC_MOBILE_ENABLED, true);
  assert.equal(await policy.shouldStartAwsKyc(async () => ({ enabled: true })), true);
  assert.equal(await policy.shouldStartAwsKyc(async () => ({ enabled: false })), false);
  assert.equal(await policy.shouldStartAwsKyc(async () => { throw { status: 404 }; }), false);
  const failure = { status: 503 };
  await assert.rejects(policy.shouldStartAwsKyc(async () => { throw failure; }), error => error === failure);
});

test('the real mobile hook continues the complete Didit path without touching AWS', async () => {
  const hooks = hookHarness();
  const calls = [];
  const mutation = (name, value) => () => ({ unwrap: async () => { calls.push(name); return value; } });
  const load = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'android' } },
    'expo-linking': { createURL: path => `zwanga://${path}` },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    'expo-router': { useRouter: () => ({ push() {} }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: () => calls.push('dialog') }) },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/features/identity/kycProvider': provider(undefined),
    '@/features/identity/awsLiveness': { hasAwsLiveness: () => { calls.push('aws-native'); return true; } },
    '@/components/identity/AwsKycProvider': { useAwsKycFlow: () => async () => { calls.push('aws-start'); return null; } },
    '@/store/api/awsKycApi': { useLazyAwsKycCapabilitiesQuery: () => [mutation('aws-capabilities', { enabled: true })] },
    '@/store/api/userApi': {
      useLazyGetCurrentUserQuery: () => [mutation('profile', {})],
      useCreateDiditKycSessionMutation: () => [mutation('didit-create', { sessionId: 'didit-id', sessionToken: 'test-token', status: 'Not Started' }), {}],
      useSyncDiditKycSessionMutation: () => [mutation('didit-sync', { status: 'approved' }), {}],
    },
    '../features/identity/diditSdk': {
      runDiditNativeVerification: async () => { calls.push('didit-native'); return { type: 'completed', session: { sessionId: 'didit-id', status: 'Approved' } }; },
      getDiditSdkFailureError: () => null,
    },
  });
  const { useDiditKycFlow } = load('hooks/useDiditKycFlow.ts');
  const flow = hooks.render(() => useDiditKycFlow({ sourceScreen: 'profile',
    onStatusRefresh: async () => calls.push('refresh'), onApproved: async () => calls.push('approved') }));
  const result = await flow.startDiditKyc({ skipLegalIdentityConfirmation: true, showResultDialog: false });
  assert.equal(result.status, 'approved');
  assert.deepEqual(calls, ['didit-create', 'didit-native', 'didit-sync', 'refresh', 'approved']);
});
