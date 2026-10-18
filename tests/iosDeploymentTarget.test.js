const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const withIosDeploymentTargetFloor = require('../plugins/withIosDeploymentTargetFloor');
const { applyIosDeploymentTargetFloor, deploymentTargetFloor } = withIosDeploymentTargetFloor;
const read = path => fs.readFileSync(path, 'utf8');
const template = `platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'
target 'test' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
    keep_existing_bridge_settings(installer)
  end
end
`;

test('fresh iOS prebuild applies the floor after React Native, including resource bundles', () => {
  const result = applyIosDeploymentTargetFloor(template);
  const expected = deploymentTargetFloor.split('\n').map(line => `    ${line}`).join('\n');
  assert(result.includes(expected));
  assert(result.indexOf(expected) > result.indexOf('react_native_post_install('));
  assert(result.indexOf(expected) < result.indexOf('keep_existing_bridge_settings'));
  assert.equal(result.replace(`\n\n${expected}`, ''), template, 'unrelated Podfile code stays intact');
  assert.match(result, /installer\.pods_project\.targets\.each/);
  assert.match(result, /pod_target\.build_configurations\.each/);
  assert.match(result, /Gem::Version\.new\(current_target\) < minimum_ios_target/);
  assert.doesNotMatch(deploymentTargetFloor, /\.to_f|target_installation_results/);
  assert.equal(applyIosDeploymentTargetFloor(result), result);
});

test('unsupported or incomplete Podfiles fail explicitly instead of silently leaving a broken build', () => {
  for (const source of ['', template.replace('post_install do |installer|', 'post_integrate do |installer|'),
    template + template, template + '# @generated begin zwanga-ios-deployment-target-floor',
    template + '# @generated end zwanga-ios-deployment-target-floor']) {
    assert.throws(() => applyIosDeploymentTargetFloor(source), /[Pp]odfile|post_install/);
  }
});

test('committed Podfile already matches prebuild, retains native fixes and one post_install hook', () => {
  const source = read('ios/Podfile');
  assert.equal(applyIosDeploymentTargetFloor(source), source);
  assert(source.includes(deploymentTargetFloor.split('\n').map(line => `    ${line}`).join('\n')),
    'native and prebuild policies must be identical');
  assert.equal((source.match(/post_install do \|installer\|/g) || []).length, 1);
  assert.equal((source.match(/# @generated begin zwanga-ios-deployment-target-floor/g) || []).length, 1);
  assert.match(source, /CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES/);
  assert.match(source, /RNFBCrashlytics/);
  assert.match(source, /DiditSDK\/AutoDetection/);
});

test('app configuration and native app keep iOS 15.1; only the Pods floor changes', () => {
  const properties = JSON.parse(read('ios/Podfile.properties.json'));
  assert.equal(properties['ios.deploymentTarget'], '15.1');
  assert.equal(properties['ios.useFrameworks'], 'static');
  const sandbox = { module: { exports: {} }, process: { env: {}, cwd: () => '/virtual' },
    require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'fs') return { existsSync: () => false };
      if (name === 'path') return path;
      throw Error('Unexpected dependency: ' + name);
    } };
  vm.runInNewContext(read('app.config.js'), sandbox);
  const { expo } = sandbox.module.exports;
  const buildProperties = expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')[1];
  assert.equal(buildProperties.ios.deploymentTarget, '15.1');
  const nativeTargets = [...read('ios/zwanga.xcodeproj/project.pbxproj').matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)];
  assert(nativeTargets.length > 0);
  assert(nativeTargets.every(match => match[1] === '15.1'));
  assert.match(read('app.plugin.js'), /withIosDeploymentTargetFloor/);
});

test('Expo registers the Podfile transformation without modifying Android', async () => {
  const config = withIosDeploymentTargetFloor({ name: 'test', slug: 'test' });
  assert.equal(config.mods.android, undefined);
  const result = await config.mods.ios.podfile({ ...config, modResults: { contents: template },
    modRequest: { platform: 'ios', modName: 'podfile', introspect: true } });
  assert.equal(result.modResults.contents, applyIosDeploymentTargetFloor(template));
});

test('Ruby policy raises old/missing targets and preserves higher versions and expressions', t => {
  // Run on macOS/Ruby hosts too. Node cannot validate execution of CocoaPods Ruby on Windows.
  const probe = spawnSync('ruby', ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (probe.error?.code === 'ENOENT') return t.skip('Ruby not installed; requires macOS/Ruby verification');
  assert.equal(probe.status, 0, probe.stderr || probe.error?.message);
  const code = `require 'rubygems'
require 'json'
Config = Struct.new(:build_settings)
Target = Struct.new(:build_configurations)
Project = Struct.new(:targets)
Installer = Struct.new(:pods_project)
values = [nil, '', '9.0', '10.0', '11.0', '12.0', '12.4', '13.4', '14', '14.0', '15.0', '15.1', '15.10', '16.0', '$(inherited)']
outputs = [{}, {'ios.deploymentTarget' => '16.0'}].map do |podfile_properties|
  installer = Installer.new(Project.new(values.map { |value| Target.new([Config.new({'IPHONEOS_DEPLOYMENT_TARGET' => value, 'DEFINES_MODULE' => 'NO'})]) }))
  2.times do
${deploymentTargetFloor}
  end
  installer.pods_project.targets.map { |target| target.build_configurations.first.build_settings }
end
puts JSON.generate(outputs)
`;
  const result = spawnSync('ruby', ['-e', code], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const [standard, raised] = JSON.parse(result.stdout);
  assert.deepEqual(standard.map(value => value.IPHONEOS_DEPLOYMENT_TARGET),
    [...Array(12).fill('15.1'), '15.10', '16.0', '$(inherited)']);
  assert.deepEqual(raised.map(value => value.IPHONEOS_DEPLOYMENT_TARGET),
    [...Array(14).fill('16.0'), '$(inherited)']);
  assert([...standard, ...raised].every(value => value.DEFINES_MODULE === 'NO'));
});
