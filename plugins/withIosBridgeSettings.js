const { withPodfile } = require('@expo/config-plugins');

const begin = '# @generated begin zwanga-ios-bridge-settings';
const end = '# @generated end zwanga-ios-bridge-settings';
const bridgeSettings = `    ${begin}
    # React Native bridge pods import React headers as frameworks. Preserve
    # @import support without exporting these bridges as public Clang modules.
    react_native_bridge_targets = [
      'react-native-maps',
      'react-native-google-maps',
      'RNFBApp',
      'RNFBAnalytics',
      'RNFBCrashlytics',
      'RNFBMessaging',
    ]
    installer.pods_project.targets.each do |target|
      if react_native_bridge_targets.include?(target.name)
        target.build_configurations.each do |build_config|
          build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
          build_config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
          build_config.build_settings['DEFINES_MODULE'] = 'NO'
        end
      end
    end
    ${end}`;

function applyBridgeSettings(source) {
  const content = source.replace(/\r\n/g, '\n');
  if (/^\s*use_modular_headers!\s*$/m.test(content)) {
    throw new Error('iOS bridge settings: remove the former global use_modular_headers! after reviewing the Podfile; use scoped bridge settings.');
  }
  const starts = content.split(begin).length - 1;
  const ends = content.split(end).length - 1;
  if (starts || ends) {
    if (starts !== 1 || ends !== 1 || content.indexOf(end) < content.indexOf(begin)) throw new Error('Invalid iOS bridge settings markers.');
    return content.replace(/^[ \t]*# @generated begin zwanga-ios-bridge-settings[\s\S]*?# @generated end zwanga-ios-bridge-settings/m, bridgeSettings);
  }
  // Do not silently layer a second, conflicting policy over a handwritten one.
  if (content.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES') || content.includes('react_native_bridge_targets')) {
    throw new Error('Unmarked iOS bridge settings: review and migrate to the generated block before prebuild.');
  }
  const anchor = /react_native_post_install\([\s\S]*?\n[ \t]*\)/g;
  if ([...content.matchAll(anchor)].length !== 1 || !content.includes('post_install do |installer|')) {
    throw new Error('Unsupported Podfile: expected one react_native_post_install hook.');
  }
  return content.replace(anchor, match => `${match}\n\n${bridgeSettings}`);
}
module.exports = config => withPodfile(config, mod => {
  mod.modResults.contents = applyBridgeSettings(mod.modResults.contents);
  return mod;
});
Object.assign(module.exports, { applyBridgeSettings, bridgeSettings });
