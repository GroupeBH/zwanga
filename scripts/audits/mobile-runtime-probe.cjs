/* global __dirname */
// Read-only inspection of a local Expo development runtime. Never logs credentials.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
async function evaluate(expression) {
  const pages = await fetch('http://127.0.0.1:8081/json/list', { signal: AbortSignal.timeout(5000) }).then(r => r.json());
  const page = pages.find(p => p.description.includes('Bridgeless'));
  if (!page) throw Error('No local development runtime');
  const url = new URL(page.webSocketDebuggerUrl);
  if (url.hostname !== '127.0.0.1' || url.port !== '8081') throw Error('Non-local debugger rejected');
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => { socket.close(); reject(Error('Runtime timeout')); }, 15000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression, returnByValue: true, awaitPromise: true,
    } })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer); socket.close();
      if (message.result?.exceptionDetails || message.error) return reject(Error('Runtime evaluation failed'));
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Debugger unavailable')); });
  });
}
const findModule = name => `[...globalThis.__r.getModules().values()].find(m=>m.verboseName===${JSON.stringify(name)})?.publicModule.exports`;
async function inspect() {
  const result = await evaluate(`(()=>{
    const env=${findModule('config/env.ts')}; const store=${findModule('store/index.ts')}?.store;
    const state=store?.getState(); const url=env?.envConfig?.apiUrl || '';
    return { development:globalThis.__DEV__,apiUrl:url,
      role:state?.auth?.user?.role,authenticated:!!state?.auth?.accessToken,
      queries:Object.values(state||{}).filter(v=>v?.queries).flatMap(v=>Object.values(v.queries).map(q=>({endpoint:q.endpointName,status:q.status,error:q.error?.status}))) };
  })()`);
  const { apiUrl, ...safe } = result;
  const url = new URL(apiUrl || 'about:blank');
  const localHosts = ['127.0.0.1', '10.0.2.2', 'localhost', ...Object.values(os.networkInterfaces()).flat().map(x => x.address)];
  return { ...safe, apiConfigured: !!apiUrl, localApi: url.protocol === 'http:' && url.port === '5200' && localHosts.includes(url.hostname) };
}
function capture(label) {
  if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid capture label');
  const adb = process.env.RIDE_AUDIT_ADB;
  const serial = process.env.RIDE_AUDIT_SERIAL || 'emulator-5554';
  if (!adb || !/^emulator-\d+$/.test(serial)) throw Error('Explicit local emulator required');
  const output = path.resolve(__dirname, '../../.expo/global-e2e-ui-20261103');
  fs.mkdirSync(output, { recursive: true });
  execFileSync(adb, ['-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/window-audit.xml'], { timeout: 15000 });
  fs.writeFileSync(path.join(output, label + '.xml'), execFileSync(adb, ['-s', serial, 'shell', 'cat', '/sdcard/window-audit.xml'], { timeout: 15000 }));
  fs.writeFileSync(path.join(output, label + '.png'), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000, maxBuffer: 12 * 1024 * 1024 }));
  return { capture: label };
}
module.exports = { evaluate, findModule, inspect, capture };
if (require.main === module) {
  Promise.resolve(process.argv[2] === 'capture' ? capture(process.argv[3]) : inspect())
    .then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
