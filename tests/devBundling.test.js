const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

test('Expo Babel can resolve its explicitly installed Fast Refresh peer', () => {
  const fromPreset = createRequire(require.resolve('babel-preset-expo/package.json'));
  const refresh = fromPreset('react-refresh/package.json');
  const semver = require('semver');
  assert.equal(typeof fromPreset('react-refresh/babel'), 'function');
  assert.equal(typeof fromPreset('react-refresh/runtime').performReactRefresh, 'function');
  assert.ok(semver.satisfies(refresh.version, require('../package.json').devDependencies['react-refresh']));
  for (const name of ['expo', 'react-native', 'babel-preset-expo']) {
    const pkg = require(`${name}/package.json`);
    const range = pkg.dependencies?.['react-refresh'] ?? pkg.peerDependencies['react-refresh'];
    assert.ok(semver.satisfies(refresh.version, range), `${name}: ${range}`);
  }
  assert.equal(require('../package-lock.json').packages['node_modules/react-refresh'].version, refresh.version);
});

for (const platform of ['android', 'ios']) {
  for (const isDev of [true, false]) {
    test(`Expo Babel transforms ${platform} ${isDev ? 'development + Fast Refresh' : 'production'}`, () => {
      const options = {
        cwd: root,
        envName: isDev ? 'development' : 'production',
        caller: {
          name: 'metro', bundler: 'metro', platform, projectRoot: root,
          isDev, isHMREnabled: true, isServer: false, isNodeModule: false,
        },
      };
      // Exercise the real config, not the TypeScript-only test transpiler.
      for (const file of ['services/rideAlertSession.ts', 'components/PassengerRideResponseCoordinator.tsx']) {
        const result = babel.transformFileSync(path.join(root, file), options);
        assert.ok(result.code.length > 0, file);
      }
      const fixture = babel.transformSync(
        'export default function RefreshProbe() { return <></>; }',
        { ...options, filename: path.join(root, 'RefreshProbe.tsx') },
      );
      if (isDev) assert.match(fixture.code, /\$RefreshReg\$/);
      else assert.doesNotMatch(fixture.code, /\$Refresh(?:Reg|Sig)\$/);
    });
  }
}
