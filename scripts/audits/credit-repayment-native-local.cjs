/* global __dirname */
// Actual Android UI -> running local API -> habitual test DB, synthetic data only.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { inspect, evaluate, findModule, capture } = require('./mobile-runtime-probe.cjs');
const { createFixture } = require('./local-credit-fixture.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const shell = (...args) => execFileSync(process.env.RIDE_AUDIT_ADB, ['-s', 'emulator-5554', 'shell', ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true });
function hierarchy() {
  const file = '/sdcard/credit-repayment-audit.xml';
  try { shell('uiautomator', 'dump', file); return shell('cat', file); }
  finally { shell('rm', '-f', file); }
}
async function tap(label, includes = false) {
  for (let attempt = 0; attempt < 9; attempt++) {
    const matches = [...hierarchy().matchAll(/<node\b[^>]*>/g)].map(m => m[0]).filter(n => {
      const desc = n.match(/content-desc="([^"]*)"/)?.[1] ?? n.match(/text="([^"]*)"/)?.[1] ?? '';
      return n.includes('package="com.zwanga"') && n.includes('enabled="true"') && n.includes('clickable="true"') &&
        (includes ? desc.includes(label) : desc === label);
    });
    if (matches.length > 1) throw Error('Ambiguous UI action');
    const b = matches[0]?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (b && +b[4] - +b[2] > 35) {
      shell('input', 'tap', String(Math.round((+b[1] + +b[3]) / 2)), String(Math.round((+b[2] + +b[4]) / 2)));
      await pause(600); return;
    }
    const size = shell('wm', 'size').match(/(\d+)x(\d+)/);
    if (!size) throw Error('Screen size unavailable');
    shell('input', 'swipe', String(Math.round(+size[1] * .88)), String(Math.round(+size[2] * .78)),
      String(Math.round(+size[1] * .88)), String(Math.round(+size[2] * .38)), '400');
    await pause(500);
  }
  throw Error('UI action not reachable: ' + label);
}
async function navigate(route) {
  await evaluate(`${findModule('node_modules/expo-router/build/exports.js')}.router.navigate(${JSON.stringify(route)})`);
  await pause(1800);
}
async function session(actor) {
  await evaluate(`(()=>{const s=${findModule('store/index.ts')}.store;const a=${findModule('store/slices/authSlice.ts')};
    globalThis.__creditAuditSession={done:false,failed:false};${findModule('services/tokenSession.ts')}.invalidateTokenSession();
    s.dispatch(a.logout());s.dispatch(${findModule('store/api/baseApi.ts')}.baseApi.util.resetApiState());
    s.dispatch(a.saveTokensAndUpdateState(${JSON.stringify({ accessToken: actor.accessToken, refreshToken: actor.refreshToken })})).unwrap().then(saved=>{
      if(!saved)throw Error('Session not saved');s.dispatch(a.setUser(${JSON.stringify(actor.user)}));globalThis.__creditAuditSession.done=true;
    }).catch(()=>{globalThis.__creditAuditSession.failed=true});return true;})()`);
  for (let i = 0; i < 30; i++) {
    const result = await evaluate('globalThis.__creditAuditSession');
    if (result?.failed) throw Error('Local fixture session failed');
    if (result?.done) return;
    await pause(500);
  }
  throw Error('Local fixture session timeout');
}
async function waitDetail(fixture, check) {
  for (let i = 0; i < 8; i++) { const credit = await fixture.detail(); if (check(credit)) return credit; await pause(1500); }
  throw Error('Expected backend credit state not reached');
}
async function pay(fixture, amount, paidMinor) {
  await tap('Montant du remboursement en francs congolais');
  shell('input', 'text', amount); await pause(500);
  assert.ok([...hierarchy().matchAll(/<node\b[^>]*>/g)].some(m => m[0].includes('android.widget.EditText') && m[0].includes(`text="${amount}"`)), 'Native amount entry must match');
  // Android can report a requested IME as shown even with a hardware keyboard.
  // Dismiss only the keyboard, never issue a navigation Back action.
  await evaluate(`${findModule('node_modules/react-native/index.js')}.Keyboard.dismiss();true`);
  await pause(400);
  await tap('Rembourser');
  const before = await fixture.detail(); assert.equal(Number(before.paidMinor), paidMinor - Number(amount) * 100);
  await tap('Confirmer le remboursement');
  const after = await waitDetail(fixture, c => Number(c.paidMinor) === paidMinor);
  return { status: after.status, paidMinor: Number(after.paidMinor), entries: after.entries.length };
}
async function main() {
  if (!process.env.RIDE_AUDIT_ADB || shell('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Explicit emulator required');
  const runtime = await inspect();
  if (!runtime.localApi || !runtime.development || !runtime.authenticated) throw Error('Authenticated local dev build required');
  const original = await evaluate(`(()=>{const a=${findModule('store/index.ts')}.store.getState().auth;return {accessToken:a.accessToken,refreshToken:a.refreshToken,user:a.user}})()`);
  const report = { localOnly: true, syntheticOnly: true, steps: [], sessionRestored: false };
  let fixture;
  try {
    fixture = await createFixture(); report.steps.push('synthetic offer created through actual API'); console.log('Native test: synthetic offer ready');
    await session(fixture.driver); await navigate('/(tabs)/profile');
    await tap('Mes remboursements'); await pause(1200);
    await tap('Telephone fictif - test local', true);
    await tap('J’accepte ce contrat', true); await tap('Accepter le contrat');
    const accepted = await waitDetail(fixture, c => c.status === 'accepted');
    // A newly verified driver can receive the existing welcome bonus during bootstrap.
    // Assert the credit ledger, not a fixed wallet balance that ignores that credit.
    assert.equal(Number(accepted.paidMinor), 0); assert.equal(accepted.entries.length, 0);
    report.steps.push('native consent, no debit before delivery'); console.log('Native test: consent verified');
    await fixture.deliver(); await navigate('/services'); await tap('Mes remboursements'); await pause(1200);
    await tap('Telephone fictif - test local', true);
    report.partial = await pay(fixture, '100', 10000); report.steps.push('native partial repayment confirmed by API'); console.log('Native test: partial repayment verified');
    capture('credit-native-partial');
    await navigate('/services'); await tap('Mes remboursements'); await pause(1000);
    assert.ok(hierarchy().includes('900')); report.steps.push('remaining balance refreshed after reopening');
    await tap('Telephone fictif - test local', true);
    report.total = await pay(fixture, '900', 100000); assert.equal(report.total.status, 'settled'); assert.equal(report.total.entries, 2);
    report.steps.push('native total repayment, exactly two financial entries'); console.log('Native test: total repayment verified');
    await navigate('/(tabs)/profile'); await tap('Mes remboursements'); await pause(1000);
    assert.ok(hierarchy().includes('Aucun crédit en cours')); await tap('Voir les anciens crédits');
    assert.ok(hierarchy().includes('Telephone fictif - test local')); capture('credit-native-history');
    report.steps.push('settled contract visible in history from Profile'); report.success = true;
  } catch (error) {
    report.success = false; report.failure = error.code || error.message;
    try { capture('credit-native-failure'); } catch { /* Keep the original failure. */ }
    process.exitCode = 1;
  } finally {
    try { await session(original); await navigate('/services'); report.sessionRestored = true; }
    catch { report.sessionRestored = false; process.exitCode = 1; }
    try { await fixture?.close(); report.syntheticSessionsRevoked = Boolean(fixture); }
    catch { report.syntheticSessionsRevoked = false; process.exitCode = 1; }
    fs.writeFileSync(path.resolve(__dirname, '../../.expo/credit-native-local-2026-11-15.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
}
main().catch(() => { console.error('Local native credit setup unavailable; credentials not logged'); process.exitCode = 1; });
