const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function withProviderEnv(value, legacyFlag, read) {
  const variables = { EXPO_PUBLIC_KYC_PROVIDER: value, EXPO_PUBLIC_AWS_KYC_ENABLED: legacyFlag };
  const previous = Object.fromEntries(Object.keys(variables).map(key => [key, process.env[key]]));
  try {
    for (const [key, setting] of Object.entries(variables)) {
      if (setting === undefined) delete process.env[key];
      else process.env[key] = setting;
    }
    return read();
  } finally {
    for (const [key, setting] of Object.entries(previous)) {
      if (setting === undefined) delete process.env[key];
      else process.env[key] = setting;
    }
  }
}
const provider = (value, legacyFlag) => withProviderEnv(value, legacyFlag, () => loader()('features/identity/kycProvider.ts'));

test('new builds default to AWS and cannot silently revert to Didit through the legacy flag', async () => {
  for (const flag of [undefined, 'false', '', '1', 'TRUE']) {
    const policy = provider(undefined, flag);
    let calls = 0;
    assert.equal(policy.KYC_PROVIDER, 'aws');
    assert.equal(policy.AWS_KYC_MOBILE_ENABLED, true);
    assert.equal(await policy.shouldStartAwsKyc(async () => { calls++; return { enabled: true }; }), true);
    await assert.rejects(policy.shouldStartAwsKyc(async () => { calls++; throw new Error('AWS unavailable'); }), /AWS unavailable/);
    assert.equal(calls, 2);
  }
});

test('an explicit provider takes precedence over the legacy flag', async () => {
  for (const [value, flag, expected] of [['didit', 'true', 'didit'], ['aws', 'false', 'aws'], [' AWS ', undefined, 'aws'], [' DIDIT ', undefined, 'didit']]) {
    const policy = provider(value, flag);
    assert.equal(policy.KYC_PROVIDER, expected);
    let calls = 0;
    assert.equal(await policy.shouldStartAwsKyc(async () => { calls++; return { enabled: true }; }), expected === 'aws');
    assert.equal(calls, expected === 'aws' ? 1 : 0);
  }
});

test('absent or empty provider selects AWS regardless of the retired opt-in', async () => {
  for (const value of [undefined, '', '   ']) {
    const policy = provider(value, 'true');
    assert.equal(policy.KYC_PROVIDER, 'aws');
    assert.equal(await policy.shouldStartAwsKyc(async () => ({ enabled: true })), true);
  }
});

test('release and device build profiles explicitly select AWS', () => {
  const builds = require('../eas.json').build;
  for (const profile of ['dev', 'dev-device', 'production'])
    assert.equal(builds[profile].env.EXPO_PUBLIC_KYC_PROVIDER, 'aws');
});

test('a server-side cutover gives an actionable update message, not a retry loop', () => {
  const { getKycErrorPresentation } = loader()('features/identity/diditErrors.ts');
  const result = getKycErrorPresentation({ status: 400, data: { code: 'KYC_APP_UPDATE_REQUIRED' } }, 'creating_session');
  assert.equal(result.code, 'KYC_APP_UPDATE_REQUIRED');
  assert.equal(result.title, 'Mise à jour nécessaire');
  assert.match(result.message, /Mettez à jour/);
});

test('AWS requires backend approval and never silently falls back to Didit', async () => {
  const policy = provider('aws');
  assert.equal(policy.AWS_KYC_MOBILE_ENABLED, true);
  assert.equal(await policy.shouldStartAwsKyc(async () => ({ enabled: true })), true);
  for (const response of [{ enabled: false }, { enabled: 'true' }, {}, null]) {
    await assert.rejects(policy.shouldStartAwsKyc(async () => response), error => error.presentation.code === 'AWS_KYC_UNAVAILABLE');
  }
  await assert.rejects(policy.shouldStartAwsKyc(async () => { throw { status: 404 }; }), error => error.presentation.code === 'AWS_KYC_UNAVAILABLE');
  for (const failure of [{ status: 503 }, { status: 401 }, { status: 'FETCH_ERROR' }]) {
    await assert.rejects(policy.shouldStartAwsKyc(async () => { throw failure; }), error => error === failure);
  }
});

test('invalid provider configuration blocks only the KYC action without contacting any provider', async () => {
  for (const value of ['awss', 'true', 'keccel']) {
    const policy = provider(value, 'true');
    assert.equal(policy.KYC_PROVIDER, null);
    assert.equal(policy.AWS_KYC_MOBILE_ENABLED, false);
    await assert.rejects(policy.shouldStartAwsKyc(async () => assert.fail('No backend call expected')), error => error.presentation.code === 'KYC_PROVIDER_INVALID');
  }
});
test('server preparation is explained without retry loops or leaking arbitrary diagnostics', async () => {
  const policy = provider('aws');
  for (const code of ['AWS_KYC_DISABLED', 'AWS_KYC_CONFIGURATION_REQUIRED']) {
    await assert.rejects(policy.shouldStartAwsKyc(async () => ({ enabled: false, unavailableCode: code })), error => {
      assert.equal(error.presentation.code, code);
      assert.equal(error.presentation.title, 'Vérification en préparation');
      assert.doesNotMatch(error.presentation.message, /Réessayez/);
      return true;
    });
  }
  await assert.rejects(policy.shouldStartAwsKyc(async () => ({ enabled: false, unavailableCode: 'private-config-value' })), error => {
    assert.equal(error.presentation.code, 'AWS_KYC_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(error.presentation), /private-config-value/);
    return true;
  });
});

function mobileFlow({ selected, legacyFlag, capabilities = { enabled: true }, capabilityError, nativeAvailable = true, awsOutcome = { status: 'approved' } } = {}) {
  const hooks = hookHarness();
  const calls = [], dialogs = [], events = [];
  const mutation = (name, value) => () => ({ unwrap: async () => { calls.push(name); return value; } });
  const load = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'android' } },
    'expo-linking': { createURL: path => `zwanga://${path}` },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    'expo-router': { useRouter: () => ({ push() {} }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => { calls.push('dialog'); dialogs.push(value); } }) },
    '@/services/analytics': { trackEvent: async name => { events.push(name); } },
    '@/features/identity/awsLiveness': { hasAwsLiveness: () => { calls.push('aws-native'); return nativeAvailable; } },
    '@/components/identity/AwsKycProvider': { useAwsKycFlow: () => async () => { calls.push('aws-start'); return awsOutcome; } },
    '@/store/api/awsKycApi': { useLazyAwsKycCapabilitiesQuery: () => [() => ({ unwrap: async () => {
      calls.push('aws-capabilities');
      if (capabilityError) throw capabilityError;
      return capabilities;
    } })] },
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
  const { useDiditKycFlow } = withProviderEnv(selected, legacyFlag, () => load('hooks/useDiditKycFlow.ts'));
  const flow = hooks.render(() => useDiditKycFlow({ sourceScreen: 'profile',
    onStatusRefresh: async () => calls.push('refresh'), onApproved: async () => calls.push('approved') }));
  return { calls, dialogs, events, start: () => flow.startDiditKyc({ skipLegalIdentityConfirmation: true, showResultDialog: false }) };
}

test('the real mobile hook continues the complete Didit path without touching AWS', async () => {
  for (const config of [{ selected: 'didit' }, { selected: 'didit', legacyFlag: 'true' }]) {
    const app = mobileFlow(config);
    assert.equal((await app.start()).status, 'approved');
    assert.deepEqual(app.calls, ['didit-create', 'didit-native', 'didit-sync', 'refresh', 'approved']);
  }
});

test('the real mobile hook starts AWS and refreshes server state after approval, with no Didit session', async () => {
  const app = mobileFlow({ selected: 'aws' });
  assert.equal((await app.start()).status, 'approved');
  assert.deepEqual(app.calls, ['aws-capabilities', 'aws-native', 'aws-start', 'refresh', 'approved']);
});

test('an AWS pending review or cancellation does not call the approval callback or open Didit', async () => {
  for (const awsOutcome of [{ status: 'pending' }, null]) {
    const app = mobileFlow({ selected: 'aws', awsOutcome });
    assert.deepEqual(await app.start(), awsOutcome);
    assert.deepEqual(app.calls, ['aws-capabilities', 'aws-native', 'aws-start', 'refresh']);
  }
});

test('an old binary without native AWS capture stops before opening any verification session', async () => {
  const app = mobileFlow({ selected: 'aws', nativeAvailable: false });
  assert.equal(await app.start(), null);
  assert.deepEqual(app.calls, ['aws-capabilities', 'aws-native', 'dialog']);
  assert.equal(app.dialogs[0].title, 'Mise à jour nécessaire');
});

test('AWS capability failures show actionable errors, never opening either provider', async () => {
  for (const config of [{ capabilities: { enabled: false } }, { capabilityError: { status: 404 } }, { capabilityError: { status: 503 } }, { capabilityError: { status: 'FETCH_ERROR' } }]) {
    const app = mobileFlow({ selected: 'aws', ...config });
    assert.equal(await app.start(), null);
    assert.deepEqual(app.calls, ['aws-capabilities', 'dialog']);
    assert.equal(app.dialogs.length, 1);
    assert.deepEqual(app.events, ['kyc_aws_error']);
  }
});

test('an invalid mobile provider produces a configuration error, not a false Didit failure', async () => {
  const app = mobileFlow({ selected: 'awss' });
  assert.equal(await app.start(), null);
  assert.deepEqual(app.calls, ['dialog']);
  assert.match(app.dialogs[0].message, /configurée/);
  assert.deepEqual(app.events, ['kyc_configuration_error']);
});
