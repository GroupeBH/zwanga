const { withXcodeProject } = require('@expo/config-plugins');

const phaseName = '[RNFB] Crashlytics Configuration';
function ensureCrashlyticsPhase(project) {
  const target = project.getFirstTarget();
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  // CocoaPods uses the CP-User prefix. Recognize either form, never duplicate uploads.
  const existing = target.firstTarget.buildPhases.find(({ value }) =>
    phases[value]?.name?.includes(phaseName));
  if (existing) return;
  project.addBuildPhase([], 'PBXShellScriptBuildPhase', `[CP-User] ${phaseName}`, target.uuid, {
    shellPath: '/bin/sh',
    shellScript: 'bash "${SRCROOT}/../node_modules/@react-native-firebase/crashlytics/ios_config.sh"',
    inputPaths: [
      '"${DWARF_DSYM_FOLDER_PATH}/${DWARF_DSYM_FILE_NAME}/Contents/Resources/DWARF/${TARGET_NAME}"',
      '"$(BUILT_PRODUCTS_DIR)/$(INFOPLIST_PATH)"',
    ],
  });
}
module.exports = config => withXcodeProject(config, mod => {
  ensureCrashlyticsPhase(mod.modResults);
  return mod;
});
module.exports.ensureCrashlyticsPhase = ensureCrashlyticsPhase;
