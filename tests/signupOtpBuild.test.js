const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { build } = require('../eas.json');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');
const flag = 'EXPO_PUBLIC_ENABLE_SIGNUP_OTP';

function profileEnv(name, platform) {
  const profile = build[name];
  assert.ok(profile, `Unknown build profile: ${name}`);
  return {
    ...(profile.extends ? profileEnv(profile.extends, platform) : {}),
    ...profile.env,
    ...profile[platform]?.env,
  };
}

function expoExtra(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    process: { env, cwd: () => root },
    require(name) {
      // Never load the developer's .env, credentials or native plugins.
      if (name === 'dotenv') return { config() {} };
      if (name === 'fs') return { existsSync: () => false };
      if (name === 'path') return path;
      throw new Error(`Unexpected config dependency: ${name}`);
    },
  }, { filename: 'app.config.js', timeout: 1000 });
  return module.exports.expo.extra;
}

function runtimeConfig(extra) {
  return loader({ 'expo-constants': { expoConfig: { extra } } })(
    'config/env.ts',
  );
}

for (const profile of ['dev', 'dev-device', 'production', 'ride-alerts-test']) {
  for (const platform of ['android', 'ios']) {
    test(`${profile}/${platform}: signup OTP reaches the runtime config`, () => {
      const env = profileEnv(profile, platform);
      assert.equal(env[flag], 'true');
      assert.equal(env.EXPO_PUBLIC_REQUIRE_ACCOUNT_PHONE_OTP, 'true');
      const extra = expoExtra({
        ...env,
        EAS_BUILD_PROFILE: profile,
        CHOTTULINK_MOBILE_API_KEY: 'fixture-public-mobile-key',
        CHOTTULINK_DOMAIN: 'example.invalid',
      });
      assert.equal(extra[flag], 'true');
      assert.equal(runtimeConfig(extra).isSignupOtpVerificationEnabled, true);
      assert.equal(runtimeConfig(extra).isAccountPhoneVerificationRequired, true);
    });
  }
}

test('explicit signup OTP rollback and unconfigured legacy builds remain supported', () => {
  for (const env of [{ [flag]: 'false' }, {}]) {
    const extra = expoExtra(env);
    assert.equal(extra[flag], 'false');
    assert.equal(runtimeConfig(extra).isSignupOtpVerificationEnabled, false);
    assert.equal(runtimeConfig(extra).isAccountPhoneVerificationRequired, false);
  }
});

test('SMS provider secrets and server enforcement never enter the public Expo config', () => {
  const extra = expoExtra({
    [flag]: 'true',
    OTP_PROVIDER: 'mobishastra',
    REGISTRATION_PHONE_OTP_REQUIRED: 'false',
    MOBISHASTRA_PROFILE_ID: 'server-only-fixture-profile',
    MOBISHASTRA_PASSWORD: 'server-only-fixture-password',
    OTP_CODE_HMAC_SECRET: 'server-only-fixture-hmac',
  });
  const serialized = JSON.stringify(extra);
  assert.doesNotMatch(serialized, /server-only-fixture|MOBISHASTRA|OTP_PROVIDER|OTP_CODE_HMAC|REGISTRATION_PHONE_OTP_REQUIRED/);
  assert.equal(runtimeConfig(extra).isSignupOtpVerificationEnabled, true);
});
