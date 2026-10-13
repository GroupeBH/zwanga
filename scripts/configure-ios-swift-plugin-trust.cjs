const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const approved = require('../config/ios-swift-plugin-trust.json');

// Trust only the explicitly approved AWS plugin revision, never all Swift plugins/macros.
// Xcode's macOS trust store is documented at:
// https://forums.swift.org/t/61331
function approvedEntry() {
  if (approved.packageIdentity !== 'smithy-swift' ||
      approved.repositoryURL !== 'https://github.com/smithy-lang/smithy-swift' ||
      approved.targetName !== 'SmithyCodeGeneratorPlugin' ||
      !/^\d+\.\d+\.\d+$/.test(approved.version) || !/^[a-f0-9]{40}$/.test(approved.fingerprint)) {
    throw new Error('Autorisation Swift invalide : vérifier la version et l’empreinte Smithy.');
  }
  const { fingerprint, packageIdentity, targetName } = approved;
  return { fingerprint, packageIdentity, targetName };
}

function mergePluginTrust(existing) {
  if (!Array.isArray(existing) || existing.some(entry => !entry || typeof entry !== 'object' ||
      typeof entry.fingerprint !== 'string' || typeof entry.packageIdentity !== 'string' || typeof entry.targetName !== 'string')) {
    throw new Error('Registre de confiance Swift invalide ; aucun écrasement effectué.');
  }
  const entry = approvedEntry();
  return existing.some(value => value.fingerprint === entry.fingerprint &&
    value.packageIdentity === entry.packageIdentity && value.targetName === entry.targetName)
    ? existing : [...existing, entry];
}

function configureIosSwiftPluginTrust({ env = process.env, platform = process.platform,
  homeDirectory = os.homedir(), fileSystem = fs, log = console.log } = {}) {
  // Do not silently change a developer's Mac, even when using eas build --local.
  if (platform !== 'darwin' || env.EAS_BUILD !== 'true' || env.EAS_BUILD_PLATFORM !== 'ios' ||
      env.EAS_BUILD_RUNNER !== 'eas-build') {
    log('[ios-swift-plugin-trust] Ignoré hors du build iOS EAS cloud.');
    return false;
  }
  const canonical = path.join(homeDirectory, 'Library', 'org.swift.swiftpm', 'security');
  const legacy = path.join(homeDirectory, '.swiftpm', 'security');
  // Xcode normally symlinks the legacy path. Preserve it if a runner uses an
  // independent directory, without creating/replacing any symlink ourselves.
  const directories = [canonical, ...(fileSystem.existsSync(legacy) ? [legacy] : [])];
  const changes = directories.map(directory => {
    const file = path.join(directory, 'plugins.json');
    const before = fileSystem.existsSync(file) ? fileSystem.readFileSync(file, 'utf8') : null;
    const existing = before === null ? [] : JSON.parse(before);
    const merged = mergePluginTrust(existing);
    return { directory, file, changed: before === null || merged !== existing, after: JSON.stringify(merged, null, 2) + '\n' };
  });
  // Validate every existing store before any write. Repeated hooks are no-ops.
  for (const change of changes) {
    if (!change.changed) continue;
    fileSystem.mkdirSync(change.directory, { recursive: true });
    fileSystem.writeFileSync(change.file, change.after, { encoding: 'utf8', mode: 0o600 });
  }
  log(`[ios-swift-plugin-trust] ${approved.targetName} autorisé pour ${approved.packageIdentity} ${approved.version} (${approved.fingerprint}). Autres validations inchangées.`);
  return true;
}

if (require.main === module) {
  try { configureIosSwiftPluginTrust(); }
  catch {
    // Never dump the trust file or environment in CI logs.
    console.error('[ios-swift-plugin-trust] Impossible de préparer la confiance Swift. Vérifier le registre plugins.json et la configuration Smithy ; validation globale non désactivée.');
    process.exitCode = 1;
  }
}

module.exports = { configureIosSwiftPluginTrust, mergePluginTrust };
