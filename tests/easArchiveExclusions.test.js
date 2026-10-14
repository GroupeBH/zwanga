const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const createIgnore = require('ignore');

const rules = fs.readFileSync('.gitignore', 'utf8');
const rootIgnore = createIgnore().add(rules);
// EAS's older Windows copy filter skips nested rules because its prefix check
// receives backslashes. Exercise only the root rules, as well as native paths.
const ignored = filename => rootIgnore.ignores(filename);
const variants = filename => [...new Set([filename, filename.split('/').join(path.sep)])];

test('root exclusions prevent Android machine caches and stale autolinking from entering EAS', () => {
  for (const filename of [
    'android/build/generated/autolinking/autolinking.json',
    'android/build/generated/autolinking/package-lock.json.sha',
    'android/app/build/intermediates/classes/debug/Test.class',
    'android/app/build/outputs/apk/debug/app-debug.apk',
    'android/.gradle/8.14.3/fileHashes/fileHashes.bin',
    'android/.kotlin/sessions/session',
    'android/app/.cxx/Debug/configure.bin',
    'android/.idea/workspace.xml',
    'android/local.properties',
    'android/app/app.iml',
    'android/heap.hprof',
    'android/app/main.jsbundle',
  ]) for (const variant of variants(filename)) assert.equal(ignored(variant), true, variant);
});

test('root exclusions also cover iOS local build, Pods and user-specific state', () => {
  for (const filename of [
    'ios/build/Build/Products/Debug-iphoneos/zwanga.app/zwanga',
    'ios/DerivedData/ModuleCache.noindex/cache',
    'ios/Pods/AWS/package',
    'ios/zwanga.xcodeproj/xcuserdata/local.xcuserdatad/settings',
    'ios/zwanga.xcworkspace/xcuserdata/local.xcuserdatad/settings',
    'ios/.xcode.env.local',
    'ios/archive.ipa',
    'ios/module.hmap',
    'ios/bundle.jsbundle',
    'ios/zwanga.xcodeproj/user.pbxuser',
    'ios/zwanga.xcodeproj/user.mode1v3',
    'ios/zwanga.xcodeproj/user.mode2v3',
    'ios/zwanga.xcodeproj/user.perspectivev3',
  ]) for (const variant of variants(filename)) assert.equal(ignored(variant), true, variant);
});

test('native sources, KYC, notifications, build configuration and Swift resolution stay included', () => {
  for (const filename of [
    'android/app/build.gradle', 'android/build.gradle', 'android/settings.gradle',
    'android/gradle.properties', 'android/gradlew', 'android/gradlew.bat',
    'android/gradle/wrapper/gradle-wrapper.jar', 'android/gradle/wrapper/gradle-wrapper.properties',
    'android/app/debug.keystore', 'android/app/google-services.json',
    'android/app/src/main/java/com/zwanga/kyc/ZwangaAwsLiveness.kt',
    'android/app/src/main/AndroidManifest.xml', 'android/app/src/main/res/raw/driver_ring.wav',
    'ios/Podfile', 'ios/Podfile.lock', 'ios/Podfile.properties.json', 'ios/.xcode.env',
    'ios/zwanga.xcodeproj/project.pbxproj', 'ios/zwanga.xcworkspace/contents.xcworkspacedata',
    'ios/zwanga.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved',
    'ios/zwanga.xcodeproj/xcshareddata/xcschemes/zwanga.xcscheme',
    'ios/zwanga/ZwangaAwsLiveness.swift', 'ios/zwanga/ZwangaAwsLivenessBridge.m',
    'ios/zwanga/GoogleService-Info.plist', 'ios/zwanga/zwanga.entitlements',
    'ios/zwanga/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png',
    'ios/zwanga.xcodeproj/default.pbxuser', 'ios/zwanga.xcodeproj/default.mode1v3',
    'ios/zwanga.xcodeproj/default.mode2v3', 'ios/zwanga.xcodeproj/default.perspectivev3',
    'native/kyc-ios/Package.swift', 'plugins/withAwsLiveness.js', 'scripts/patch-notifee-expo-driver-actions.cjs',
    'app.config.js', 'app.plugin.js', 'eas.json', 'package.json', 'package-lock.json',
    'assets/sounds/driver_ring.wav',
  ]) for (const variant of variants(filename)) assert.equal(ignored(variant), false, variant);
});

test('no currently tracked native file is dropped by the root archive rules', () => {
  const nativeFiles = execFileSync('git', ['ls-files', '-z', '--', 'android', 'ios', 'native'], { encoding: 'utf8' })
    .split('\0').filter(Boolean);
  assert.ok(nativeFiles.length > 20, 'exercise the real committed native project, not just synthetic paths');
  for (const filename of nativeFiles) assert.equal(ignored(filename), false, filename);
});

test('existing dotenv, signing-key and dependency exclusions remain in effect', () => {
  for (const filename of ['.env', '.env.local', '.env.production.local', 'release.jks', 'key.p8',
    'certificate.p12', 'certificate.pem', 'release.mobileprovision', 'node_modules/example/index.js', '.expo/state.json']) {
    assert.equal(ignored(filename), true, filename);
  }
  assert.equal(fs.existsSync('.easignore'), false,
    'a future .easignore replaces root and nested gitignore rules; update this archive guard if one is added');
});
