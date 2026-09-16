/* global __dirname */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const expectedDomain = 'zwanga-app.chottu.link';
const configuredDomain = String(process.env.CHOTTULINK_DOMAIN || '').trim();
const mobileApiKey = String(process.env.CHOTTULINK_MOBILE_API_KEY || '').trim();
const isProduction = process.env.EAS_BUILD_PROFILE === 'production';

const failures = [];
if (isProduction && !mobileApiKey) {
  failures.push('CHOTTULINK_MOBILE_API_KEY manque dans le profil EAS production.');
}
if (isProduction && !configuredDomain) {
  failures.push('CHOTTULINK_DOMAIN manque dans le profil EAS production.');
}
if (configuredDomain && configuredDomain !== expectedDomain) {
  failures.push(
    `CHOTTULINK_DOMAIN=${configuredDomain} ne correspond pas au domaine natif ${expectedDomain}.`,
  );
}

const manifest = fs.readFileSync(
  path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
  'utf8',
);
if (
  !manifest.includes(`android:host="${expectedDomain}"`) ||
  !manifest.includes('android:autoVerify="true"')
) {
  failures.push("L'App Link ChottuLink verifie manque dans AndroidManifest.xml.");
}

const entitlements = fs.readFileSync(
  path.join(projectRoot, 'ios', 'zwanga', 'zwanga.entitlements'),
  'utf8',
);
if (!entitlements.includes(`applinks:${expectedDomain}`)) {
  failures.push("L'Associated Domain ChottuLink manque dans zwanga.entitlements.");
}

if (failures.length > 0) {
  console.error('[referral-config] Configuration invalide:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `[referral-config] Configuration native valide pour ${expectedDomain}${
    isProduction ? ' (production)' : ''
  }.`,
);
