// Scoped native generation for checked-in native projects, without a full Expo prebuild.
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const { configureAppGradle, configureProjectGradle, configureMain, configureXcode } = require('../plugins/withAwsLiveness');
const root = path.resolve(__dirname, '..');
const update = (relative, transform) => {
  const target = path.join(root, relative);
  const before = fs.readFileSync(target, 'utf8'), after = transform(before);
  if (after !== before) fs.writeFileSync(target, after);
};
update('android/build.gradle', configureProjectGradle);
update('android/app/build.gradle', configureAppGradle);
update('android/app/src/main/java/com/zwanga/MainApplication.kt', configureMain);
update('android/app/src/main/AndroidManifest.xml', text => text.includes('com.zwanga.kyc.ZwangaAwsLivenessActivity') ? text : text.replace(/(<application\b[^>]*>)/, '$1\n    <activity android:name="com.zwanga.kyc.ZwangaAwsLivenessActivity" android:exported="false" android:theme="@style/AppTheme"/>'));
for (const [platform, destination] of [['android', 'android/app/src/main/java/com/zwanga/kyc'], ['ios', 'ios/zwanga']]) {
  const source = path.join(root, 'native/aws-liveness', platform);
  fs.mkdirSync(path.join(root, destination), { recursive: true });
  for (const file of fs.readdirSync(source)) fs.copyFileSync(path.join(source, file), path.join(root, destination, file));
}
const projectPath = path.join(root, 'ios/zwanga.xcodeproj/project.pbxproj');
const project = xcode.project(projectPath); project.parseSync();
configureXcode(project, 'zwanga');
const output = project.writeSync();
if (output !== fs.readFileSync(projectPath, 'utf8')) fs.writeFileSync(projectPath, output);
console.log('AWS Liveness native registration generated. Native compilation/device tests are still required.');
