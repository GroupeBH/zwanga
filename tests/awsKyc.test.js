const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const plugin = require('../plugins/withAwsLiveness');
const { loader } = require('./helpers/loadTypeScript.cjs');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('native Gradle and package registration are idempotent and pinned', () => {
  for (const [file, transform] of [['android/build.gradle', plugin.configureProjectGradle], ['android/app/build.gradle', plugin.configureAppGradle], ['android/app/src/main/java/com/zwanga/MainApplication.kt', plugin.configureMain]]) {
    const once = transform(read(file)); assert.equal(transform(once), once);
  }
  assert.match(plugin.configureAppGradle(''), /liveness:1\.5\.0/);
});
test('Swift package and source registration is idempotent without editing the project', () => {
  const p = xcode.project(path.join(__dirname, '../ios/zwanga.xcodeproj/project.pbxproj')); p.parseSync();
  plugin.configureXcode(p, 'zwanga'); const first = p.writeSync();
  plugin.configureXcode(p, 'zwanga'); assert.equal(p.writeSync(), first);
  assert.match(first, /FaceLiveness/); assert.match(first, /AWSPluginsCore/);
  const awsReferences = Object.values(p.hash.project.objects.PBXFileReference)
    .filter(ref => ref && typeof ref === 'object' && String(ref.path).includes('ZwangaAwsLiveness'));
  assert.equal(awsReferences.length, 2);
  for (const reference of awsReferences) assert.equal(reference.explicitFileType, undefined);
});
test('mobile never submits biometric scores or persists AWS credentials', () => {
  const api = read('store/api/awsKycApi.ts'), native = read('features/identity/awsLiveness.ts');
  assert.doesNotMatch(api + native, /AsyncStorage\.|SecureStore\.setItem|confidence:|similarity:/);
  assert.match(api, /\/complete`, method: 'POST'/);
  assert.match(read('components/identity/AwsKycProvider.tsx'), /credentials\.reset\(\)/);
});
test('all supported RDC documents and explicit consent are presented', () => {
  const screen = read('components/identity/AwsKycProvider.tsx');
  assert.match(screen, /consentVersion.*AWS_KYC_CONSENT/);
  assert.match(screen, /sans expiration automatique/);
  for (const type of ['voter_card', 'passport', 'driving_license']) assert.match(read('features/identity/awsKycContracts.ts'), new RegExp(type));
});
test('AWS requires mobile opt-in before querying the server and remains guarded by the native module', () => {
  const flow = read('hooks/useDiditKycFlow.ts');
  assert.match(flow, /await shouldStartAwsKyc\(/); assert.match(flow, /if \(awsEnabled\)/); assert.match(flow, /hasAwsLiveness/);
  assert.match(read('components/identity/AwsKycProvider.tsx'), /if \(!AWS_KYC_MOBILE_ENABLED\)/);
});
test('manual review continues to refresh in foreground, final decisions stop polling', () => {
  const { awsKycPollingInterval } = loader({})('features/identity/kycDecision.ts');
  const session = { status: 'pending', state: 'review' };
  assert.equal(awsKycPollingInterval(session, true, false), 30000);
  assert.equal(awsKycPollingInterval({ ...session, state: 'compare' }, true, false), 5000);
  for (const status of ['approved', 'rejected']) assert.equal(awsKycPollingInterval({ ...session, status }, true, false), 0);
  assert.equal(awsKycPollingInterval(session, false, false), 0);
  assert.equal(awsKycPollingInterval(session, true, true), 0);
});
test('KYC pushes only trigger a server refresh for the current account, never grant a role', () => {
  const { isKycDecisionNotification } = loader({})('features/identity/kycDecision.ts');
  const data = { type: 'kyc_approved', kycId: 'kyc', userId: 'user', role: 'driver' };
  assert.equal(isKycDecisionNotification(data, 'user'), true);
  assert.equal(isKycDecisionNotification(data, 'other'), false);
  assert.equal(isKycDecisionNotification(data, undefined), false);
  assert.equal(isKycDecisionNotification({ type: 'other', kycId: 'kyc' }, 'user'), false);
  assert.equal(isKycDecisionNotification({ type: 'kyc_rejected', kycId: 'legacy' }, 'user'), true);
  const { getNotificationHref } = loader({})('utils/notificationNavigation.ts');
  assert.equal(getNotificationHref(data, { id: 'user', role: 'passenger' }), '/(tabs)/profile');
});
