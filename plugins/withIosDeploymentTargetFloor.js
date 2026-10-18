const { withPodfile } = require('@expo/config-plugins');

const begin = '# @generated begin zwanga-ios-deployment-target-floor';
const end = '# @generated end zwanga-ios-deployment-target-floor';
// React Native updates library targets, but not all resource/privacy bundles.
// Keep every Pods target at least as high as the app, without lowering newer pods.
const deploymentTargetFloor = String.raw`${begin}
minimum_ios_target = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '15.1')
installer.pods_project.targets.each do |pod_target|
  pod_target.build_configurations.each do |build_config|
    current_target = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_s
    # Preserve build-setting expressions; compare numeric versions, not floats.
    if current_target.empty? || (current_target.match?(/\A\d+(?:\.\d+)*\z/) && Gem::Version.new(current_target) < minimum_ios_target)
      build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios_target.to_s
    end
  end
end
${end}`;

function applyIosDeploymentTargetFloor(contents) {
  const hasBegin = contents.includes(begin);
  const hasEnd = contents.includes(end);
  if (hasBegin && hasEnd) return contents;
  if (hasBegin || hasEnd) throw new Error('Incomplete iOS deployment target floor in Podfile.');
  // Run after React Native's hook, before CocoaPods saves the generated project.
  const anchor = /^([ \t]*)react_native_post_install\([\s\S]*?^\1\)/gm;
  const matches = [...contents.matchAll(anchor)];
  if (matches.length !== 1 || !contents.includes('post_install do |installer|')) {
    throw new Error('Cannot locate the React Native post_install hook for the iOS deployment target floor.');
  }
  return contents.replace(anchor, (match, indent) =>
    `${match}\n\n${deploymentTargetFloor.split('\n').map(line => indent + line).join('\n')}`);
}

module.exports = config => withPodfile(config, mod => {
  mod.modResults.contents = applyIosDeploymentTargetFloor(mod.modResults.contents);
  return mod;
});
module.exports.applyIosDeploymentTargetFloor = applyIosDeploymentTargetFloor;
module.exports.deploymentTargetFloor = deploymentTargetFloor;
