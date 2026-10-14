const { withAppBuildGradle, withProjectBuildGradle, withMainApplication, withAndroidManifest, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const swiftPluginTrust = require('../config/ios-swift-plugin-trust.json');

const gradleMarker = '// Zwanga AWS Liveness';
// 1.6.0 fixes the shipped ELF alignment and replaces old TensorFlow Lite with
// LiteRT. Keep this conservative pin with Expo 54's Kotlin 2.1.20; newer AWS
// releases may require a coordinated Kotlin/Compose upgrade.
const androidLivenessVersion = '1.6.0';
function configureAppGradle(source) {
  const markerIndex = source.indexOf(gradleMarker);
  if (markerIndex !== -1) {
    const owned = source.slice(markerIndex);
    const dependency = /(['"])com\.amplifyframework\.ui:liveness:([^'"]+)\1/g;
    const matches = [...owned.matchAll(dependency)];
    if (matches.length !== 1 || !['1.5.0', androidLivenessVersion].includes(matches[0][2])) {
      throw new Error('AWS Liveness: review the existing dependency before upgrading its managed Gradle block.');
    }
    return source.slice(0, markerIndex) + owned.replace(dependency, `'com.amplifyframework.ui:liveness:${androidLivenessVersion}'`);
  }
  return source + `\n${gradleMarker}
apply plugin: 'org.jetbrains.kotlin.plugin.compose'
android {
  buildFeatures { compose true }
  compileOptions { coreLibraryDesugaringEnabled true }
}
dependencies {
  implementation 'com.amplifyframework.ui:liveness:${androidLivenessVersion}'
  implementation 'androidx.activity:activity-compose:1.9.3'
  implementation 'androidx.compose.material3:material3:1.3.1'
  coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs:2.1.5'
}
`;
}
function configureProjectGradle(source) {
  if (source.includes('compose-compiler-gradle-plugin')) return source;
  if (!source.includes("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')")) throw new Error('AWS Liveness: Kotlin buildscript not found');
  // Pinned to Expo 54 / RN 0.81 Kotlin. Re-evaluate together on Expo upgrades.
  return source.replace("classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')", "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath('org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.1.20')");
}
function configureMain(source) {
  if (source.includes('add(com.zwanga.kyc.ZwangaAwsLivenessPackage())')) return source;
  if (!source.includes('PackageList(this).packages.apply {')) throw new Error('AWS Liveness: package registry not found');
  return source.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n              add(com.zwanga.kyc.ZwangaAwsLivenessPackage())');
}
function configureXcode(project, name) {
  const objects = project.hash.project.objects, target = project.getFirstTarget(), root = project.getFirstProject().firstProject;
  for (const file of ['ZwangaAwsLiveness.swift', 'ZwangaAwsLivenessBridge.m']) {
    const relative = `${name}/${file}`;
    if (!project.hasFile(relative)) project.addSourceFile(relative, { target: target.uuid }, root.mainGroup);
    for (const ref of Object.values(objects.PBXFileReference)) {
      if (ref && typeof ref === 'object' && String(ref.path).replaceAll('"', '') === relative &&
          (ref.explicitFileType === undefined || ref.explicitFileType === 'undefined')) delete ref.explicitFileType;
    }
  }
  objects.XCRemoteSwiftPackageReference ??= {};
  objects.XCSwiftPackageProductDependency ??= {};
  const addPackage = (url, version, products) => {
    let id = Object.keys(objects.XCRemoteSwiftPackageReference).find(k => objects.XCRemoteSwiftPackageReference[k]?.repositoryURL === `"${url}"`);
    if (!id) {
      id = project.generateUuid();
      objects.XCRemoteSwiftPackageReference[id] = { isa: 'XCRemoteSwiftPackageReference', repositoryURL: `"${url}"`, requirement: { kind: 'exactVersion', version } };
      root.packageReferences ??= []; root.packageReferences.push({ value: id, comment: url.split('/').pop() });
    }
    for (const product of products) {
      if (Object.values(objects.XCSwiftPackageProductDependency).some(p => p?.productName === product)) continue;
      const dependency = project.generateUuid(), build = project.generateUuid();
      objects.XCSwiftPackageProductDependency[dependency] = { isa: 'XCSwiftPackageProductDependency', package: id, productName: product };
      target.firstTarget.packageProductDependencies ??= []; target.firstTarget.packageProductDependencies.push({ value: dependency, comment: product });
      objects.PBXBuildFile[build] = { isa: 'PBXBuildFile', productRef: dependency, productRef_comment: product };
      project.pbxFrameworksBuildPhaseObj(target.uuid).files.push({ value: build, comment: `${product} in Frameworks` });
    }
    return id;
  };
  addPackage('https://github.com/aws-amplify/amplify-ui-swift-liveness', '1.5.0', ['FaceLiveness']);
  addPackage('https://github.com/aws-amplify/amplify-swift', '2.60.2', ['AWSPluginsCore']);
  // Already a transitive AWS dependency. Pin its version to the approved build
  // plugin fingerprint, including on a fresh Expo prebuild.
  const smithyId = addPackage(swiftPluginTrust.repositoryURL, swiftPluginTrust.version, []);
  objects.XCRemoteSwiftPackageReference[smithyId].requirement = { kind: 'exactVersion', version: swiftPluginTrust.version };
  return project;
}
const copy = (root, platform, destination) => {
  fs.mkdirSync(destination, { recursive: true });
  const source = path.join(root, 'native/aws-liveness', platform);
  for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(destination, file));
};
module.exports = config => {
  config = withProjectBuildGradle(config, m => { m.modResults.contents = configureProjectGradle(m.modResults.contents); return m; });
  config = withAppBuildGradle(config, m => { m.modResults.contents = configureAppGradle(m.modResults.contents); return m; });
  config = withMainApplication(config, m => { m.modResults.contents = configureMain(m.modResults.contents); return m; });
  config = withAndroidManifest(config, m => {
    const app = m.modResults.manifest.application[0]; app.activity ??= [];
    if (!app.activity.some(a => a.$['android:name'] === 'com.zwanga.kyc.ZwangaAwsLivenessActivity'))
      app.activity.push({ $: { 'android:name': 'com.zwanga.kyc.ZwangaAwsLivenessActivity', 'android:exported': 'false', 'android:theme': '@style/AppTheme' } });
    return m;
  });
  config = withDangerousMod(config, ['android', m => { copy(m.modRequest.projectRoot, 'android', path.join(m.modRequest.platformProjectRoot, 'app/src/main/java/com/zwanga/kyc')); return m; }]);
  return withXcodeProject(config, m => {
    const name = m.modRequest.projectName;
    copy(m.modRequest.projectRoot, 'ios', path.join(m.modRequest.platformProjectRoot, name));
    configureXcode(m.modResults, name); return m;
  });
};
Object.assign(module.exports, { configureAppGradle, configureProjectGradle, configureMain, configureXcode });
