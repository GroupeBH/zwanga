const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
test('iOS FCM is opt-in and only a compatible binary requests a Firebase token', async () => {
  for (const platform of ['ios', 'android']) for (const enabled of [false, true]) for (const native of [false, true]) {
    let calls = 0;
    const api = { getMessaging: () => ({ isDeviceRegisteredForRemoteMessages: true }), getToken: async () => { calls++; return 'fixture-fcm'; } };
    const module = loader({ 'expo-constants': { expoConfig: { extra: { iosFirebaseMessaging: enabled } } },
      'react-native': { Platform: { OS: platform }, NativeModules: native ? { RNFBMessagingModule: {} } : {} },
      '@react-native-firebase/messaging': api, './rideAudioDiagnostics': { boundedRideAudio: p => p },
    })('services/iosFirebaseMessaging.ts');
    const expected = platform === 'ios' && enabled && native;
    assert.equal(module.usesIosFirebaseMessaging(), expected);
    assert.equal(await module.obtainIosFirebaseToken(), expected ? 'fixture-fcm' : undefined);
    assert.equal(calls, expected ? 1 : 0);
  }
});

test('a broken native Firebase setup never throws from render/subscription and token registration fails honestly', async () => {
  const errors = [];
  const module = loader({ 'expo-constants': { expoConfig: { extra: { iosFirebaseMessaging: true } } },
    'react-native': { Platform: { OS: 'ios' }, NativeModules: { RNFBMessagingModule: {} } },
    '@react-native-firebase/messaging': { getMessaging: () => { throw Error('configuration missing'); } },
    './rideAudioDiagnostics': { boundedRideAudio: p => p, reportRideAudioFailure: code => errors.push(code) },
  })('services/iosFirebaseMessaging.ts');
  assert.equal(module.usesIosFirebaseMessaging(), true);
  assert.doesNotThrow(() => module.subscribeIosFirebaseMessages(() => {})());
  assert.doesNotThrow(() => module.subscribeIosFirebaseToken(() => {})());
  await assert.rejects(module.obtainIosFirebaseToken(), /configuration missing/);
  assert.deepEqual(errors, ['IOS_FCM_SUBSCRIBE_FAILED', 'IOS_FCM_SUBSCRIBE_FAILED']);
});
