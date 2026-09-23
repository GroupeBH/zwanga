const { withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

const marker = '// ZWANGA_PATCHED_REACT_ANDROID';
const sourceBuild = `${marker}
// Compile the installed, postinstall-patched sources. Maven AARs do not contain our guard.
// Keep local debug builds usable without a host C++ compiler (notably Windows).
def sourceRequested = providers.gradleProperty('zwanga.buildReactNativeFromSource').orNull == 'true'
def releaseRequested = gradle.startParameter.taskNames.any { task ->
  def name = task.tokenize(':').last().toLowerCase()
  name.contains('release') || name in ['assemble', 'build', 'bundle']
}
if (sourceRequested || releaseRequested) {
if (!file('../node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/ViewGroupDrawingOrderHelper.kt').text.contains('ZWANGA_DRAWING_ORDER_GUARD')) {
  throw new GradleException('React Native drawing-order patch missing. Run the project postinstall before a release build.')
}
includeBuild('../node_modules/react-native') {
  dependencySubstitution {
    substitute(module('com.facebook.react:react-android')).using(project(':packages:react-native:ReactAndroid'))
    substitute(module('com.facebook.react:react-native')).using(project(':packages:react-native:ReactAndroid'))
    substitute(module('com.facebook.react:hermes-android')).using(project(':packages:react-native:ReactAndroid:hermes-engine'))
    substitute(module('com.facebook.react:hermes-engine')).using(project(':packages:react-native:ReactAndroid:hermes-engine'))
  }
}
}
`;

function applySourceBuild(contents) {
  if (contents.includes(marker)) return contents;
  return `${contents.trimEnd()}\n\n${sourceBuild}`;
}

const artifactMarker = '// ZWANGA_VERIFY_NATIVE_ARTIFACT';
const artifactCheck = `${artifactMarker}
tasks.matching { it.name == 'bundleRelease' || it.name == 'assembleRelease' }.configureEach {
  doLast {
    def kind = name == 'bundleRelease' ? 'bundle/release/*.aab' : 'apk/release/*.apk'
    def artifacts = fileTree(layout.buildDirectory.dir('outputs')).matching { include kind }.files
    if (artifacts.isEmpty()) throw new GradleException('No release artifact found for native library verification')
    def abis = (findProperty('reactNativeArchitectures') ?: 'armeabi-v7a,arm64-v8a,x86,x86_64').toString()
    artifacts.each { artifact ->
      project.exec {
        workingDir rootProject.projectDir.parentFile
        commandLine 'node', 'scripts/validate-android-native.cjs', artifact.absolutePath, '--abis=' + abis
      }
    }
  }
}
`;
function applyArtifactCheck(contents) {
  return contents.includes(artifactMarker) ? contents : `${contents.trimEnd()}\n\n${artifactCheck}`;
}

module.exports = config => withAppBuildGradle(withSettingsGradle(config, next => {
  if (next.modResults.language !== 'groovy') throw new Error('Review the ReactAndroid source-build plugin for Kotlin settings.');
  next.modResults.contents = applySourceBuild(next.modResults.contents);
  return next;
}), next => {
  if (next.modResults.language !== 'groovy') throw new Error('Review the native artifact check for Kotlin Gradle.');
  next.modResults.contents = applyArtifactCheck(next.modResults.contents);
  return next;
});
module.exports.applySourceBuild = applySourceBuild;
module.exports.applyArtifactCheck = applyArtifactCheck;
