const fs = require('fs');
const path = require('path');

const xcframeworkPath = path.join(
  process.cwd(),
  'node_modules',
  'react-native-chottulink-sdk',
  'ios',
  'Frameworks',
  'ChottuLinkSDK.xcframework',
);
const simulatorFrameworkPath = path.join(
  xcframeworkPath,
  'ios-arm64_x86_64-simulator',
  'ChottuLinkSDK.framework',
);
const targetPath = path.join(
  simulatorFrameworkPath,
  'Headers',
  'ChottuLinkSDK-Swift.h',
);
const x86SwiftInterfacePath = path.join(
  simulatorFrameworkPath,
  'Modules',
  'ChottuLinkSDK.swiftmodule',
  'x86_64-apple-ios-simulator.swiftinterface',
);

const marker = 'ZWANGA_CHOTTULINK_X86_64_HEADER_GUARD';
const arm64Directive = '#elif defined(__arm64__) && __arm64__';

if (!fs.existsSync(targetPath)) {
  throw new Error(`[chottulink-ios-patch] Swift header not found: ${targetPath}`);
}

if (!fs.existsSync(x86SwiftInterfacePath)) {
  throw new Error(
    '[chottulink-ios-patch] The installed ChottuLink XCFramework has no x86_64 simulator interface. Refusing to patch an incompatible binary.',
  );
}

const source = fs.readFileSync(targetPath, 'utf8');

if (source.includes(marker)) {
  console.log('[chottulink-ios-patch] Already applied.');
  process.exit(0);
}

const firstArchitectureDirective = source.split(/\r?\n/, 3)[1] ?? '';
if (firstArchitectureDirective.includes('defined(__x86_64__)')) {
  console.log('[chottulink-ios-patch] Installed SDK header already supports x86_64.');
  process.exit(0);
}

if (firstArchitectureDirective !== arm64Directive) {
  throw new Error(
    `[chottulink-ios-patch] Unexpected Swift architecture guard: ${firstArchitectureDirective || '<missing>'}`,
  );
}

const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
const compatibleDirective = [
  '#elif (defined(__arm64__) && __arm64__) || (defined(__x86_64__) && __x86_64__)',
  `// ${marker}: the bundled XCFramework includes an x86_64 simulator slice and interface.`,
].join(lineEnding);

fs.writeFileSync(
  targetPath,
  source.replace(arm64Directive, compatibleDirective),
  'utf8',
);
console.log('[chottulink-ios-patch] Enabled the bundled x86_64 simulator Swift interface.');
