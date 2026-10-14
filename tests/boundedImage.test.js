const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { configureMain, sync, source, target } = require('../plugins/withBoundedImage');

test('native image source is synchronized and prebuild preserves package registration', () => {
  sync(process.cwd(), true);
  assert.equal(fs.readFileSync(source, 'utf8'), fs.readFileSync(target, 'utf8'));
  const main = fs.readFileSync('android/app/src/main/java/com/zwanga/MainApplication.kt', 'utf8');
  assert.equal(configureMain(main), main);
  assert.equal(configureMain(configureMain('PackageList(this).packages.apply {')), configureMain('PackageList(this).packages.apply {'));
  assert.throws(() => configureMain('unknown template'));
  const java = fs.readFileSync(source, 'utf8');
  assert.match(java, /inJustDecodeBounds = true/);
  assert(java.indexOf('options.inSampleSize = sampleSize') < java.indexOf('decoded = BitmapFactory.decodeStream'));
  assert.match(java, /BUSY.compareAndSet\(false, true\)/);
  assert.match(java, /finally \{ BUSY.set\(false\)/);
  assert.match(java, /output.recycle\(\)/); assert.match(java, /decoded.recycle\(\)/);
  assert.match(java, /!saved && file != null/);
  assert.match(java, /case 8: matrix.setRotate\(-90\)/);
});

test('actual Java sampling bounds large, panoramic and malformed dimensions', t => {
  if (spawnSync('javac', ['-version']).status !== 0) { t.skip('JDK required'); return; }
  const java = fs.readFileSync(source, 'utf8');
  const helper = java.slice(java.indexOf('    public static int sampleSize'), java.indexOf('    private static Matrix'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-image-unit-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const file = path.join(temp, 'ImageSamplingCheck.java');
  fs.writeFileSync(file, `import java.io.IOException;
public class ImageSamplingCheck {
${helper}
  public static void main(String[] args) throws Exception {
    int[][] cases={{8000,6000},{20000,100},{1080,1920},{4000,3000},{1,1},{Integer.MAX_VALUE,1}};
    for (int[] d:cases) { int s=sampleSize(d[0],d[1]);
      if ((s & (s-1))!=0 || ((long)Math.max(d[0],d[1])+s-1)/s>2048) throw new AssertionError(); }
    if (sampleSize(1080,1920)!=1 || sampleSize(8000,6000)!=4) throw new AssertionError();
    try { sampleSize(0,4000); throw new AssertionError(); } catch(IOException expected) {}
  }
}`);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const result = spawnSync('java', ['-cp', temp, 'ImageSamplingCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});

test('Android uses bounded native decode without calling Image.getSize or ImageManipulator', async () => {
  const calls = [];
  const { prepareLocalImage } = loader({ 'react-native': { Platform: { OS: 'android' },
    Image: { getSize() { throw Error('full size path'); } },
    NativeModules: { ZwangaBoundedImage: { prepare: async (...args) => { calls.push(args); return 'file:///small.jpg'; } } },
  } })('utils/prepareLocalImage.ts');
  assert.equal(await prepareLocalImage('file:///original.jpg', 1024, 0.8), 'file:///small.jpg');
  assert.deepEqual(calls, [['file:///original.jpg', 1024, 0.8]]);
  await assert.rejects(prepareLocalImage('file:///original.jpg', NaN, 0.8));
  await assert.rejects(prepareLocalImage('file:///original.jpg', 4096, 0.8));
});

test('old Android binaries reject oversized originals instead of unsafe fallback; native failure is not retried', async () => {
  const load = module => loader({ 'react-native': { Platform: { OS: 'android' }, NativeModules: module,
    Image: { getSize: async () => ({ width: 8000, height: 6000 }) },
  } })('utils/prepareLocalImage.ts').prepareLocalImage;
  await assert.rejects(load({})('file:///large.jpg', 1024, 0.8), /Mettez Zwanga/);
  await assert.rejects(load({ ZwangaBoundedImage: { prepare: async () => { throw Error('native error'); } } })('file:///large.jpg', 1024, 0.8), /native error/);
});

test('iOS preparation and small-photo fallback release both native handles, including failed export', async () => {
  for (const osName of ['ios', 'android']) for (const fail of [false, true]) {
    const released = [], resized = [];
    const context = { resize: value => resized.push(value), release: () => released.push('context'),
      renderAsync: async () => ({ release: () => released.push('image'), saveAsync: async () => {
        if (fail) throw Error('export'); return { uri: 'file:///small.jpg' };
      } }) };
    const { prepareLocalImage } = loader({ 'react-native': { Platform: { OS: osName }, NativeModules: {},
      Image: { getSize: async () => ({ width: 1600, height: 1200 }) } },
      'expo-image-manipulator': { ImageManipulator: { manipulate: () => context }, SaveFormat: { JPEG: 'jpeg' } },
    })('utils/prepareLocalImage.ts');
    if (fail) await assert.rejects(prepareLocalImage('file:///a.jpg', 1024, 0.8), /export/);
    else assert.equal(await prepareLocalImage('file:///a.jpg', 1024, 0.8), 'file:///small.jpg');
    assert.deepEqual(resized, [{ width: 1024, height: 768 }]); assert.deepEqual(released, ['image', 'context']);
  }
});

test('Android picker copies originals, and KYC uses bounded preparation too', () => {
  for (const file of ['hooks/profile/useProfilePhotoSelection.ts', 'components/identity/AwsKycProvider.tsx'])
    assert.match(fs.readFileSync(file, 'utf8'), /quality: Platform.OS === 'android' \? 1 :/);
  assert.match(fs.readFileSync('components/identity/AwsKycProvider.tsx', 'utf8'), /prepareLocalImage\(original, 2000, 0.9\)/);
});
