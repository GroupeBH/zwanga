const { withAppBuildGradle } = require('@expo/config-plugins');
const marker = '// ZWANGA_CRASHLYTICS_NATIVE_SYMBOLS';
function configure(input) {
  if (input.includes(marker)) return input;
  return input + `
${marker}
// Also safe when a fresh prebuild applies the Firebase plugin later in this file.
plugins.withId('com.google.firebase.crashlytics') {
  android.buildTypes.release {
    firebaseCrashlytics {
      nativeSymbolUploadEnabled true
      unstrippedNativeLibsDir file("\$buildDir/intermediates/merged_native_libs/release/mergeReleaseNativeLibs/out/lib")
    }
  }
}
`;
}
module.exports = config => withAppBuildGradle(config, m => {
  m.modResults.contents = configure(m.modResults.contents); return m;
});
module.exports.configure = configure;
