const fs = require('node:fs');
const path = require('node:path');
const { sync, configureMain } = require('../plugins/withBoundedImage');
if (process.env.EAS_BUILD_PLATFORM !== 'ios' && fs.existsSync('android')) {
  sync(process.cwd(), true);
  const main = fs.readFileSync(path.join('android/app/src/main/java/com/zwanga/MainApplication.kt'), 'utf8');
  if (configureMain(main) !== main) throw new Error('Bounded image: native package registration missing.');
  console.log('[bounded-image] Native source and package registration verified.');
}
