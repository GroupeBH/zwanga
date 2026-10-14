const { withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');
const source = 'native/bounded-image/android/BoundedImagePackage.java';
const target = 'android/app/src/main/java/com/zwanga/images/BoundedImagePackage.java';
function configureMain(input) {
  const registration = 'add(com.zwanga.images.BoundedImagePackage())';
  if (input.includes(registration)) return input;
  const anchor = 'PackageList(this).packages.apply {';
  if (input.split(anchor).length !== 2) throw new Error('Bounded image: package registry not found.');
  return input.replace(anchor, `${anchor}\n              ${registration}`);
}
function sync(root, check = false) {
  const from = path.join(root, source), to = path.join(root, target);
  const expected = fs.readFileSync(from, 'utf8');
  if (check) {
    if (!fs.existsSync(to) || fs.readFileSync(to, 'utf8') !== expected)
      throw new Error('Bounded image: native source out of sync. Run node plugins/withBoundedImage.js.');
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, expected);
  }
}
module.exports = config => {
  config = withMainApplication(config, m => { m.modResults.contents = configureMain(m.modResults.contents); return m; });
  return withDangerousMod(config, ['android', async m => { sync(m.modRequest.projectRoot); return m; }]);
};
Object.assign(module.exports, { configureMain, sync, source, target });
if (require.main === module) sync(process.cwd(), process.argv.includes('--check'));
