/* global __dirname */
'use strict';
// Explicit opt-in local integration: disposable PostgreSQL/Redis, fake SMS only.
// No app .env or credentials are inherited by the worker.
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:net');
const backend = resolve(__dirname, '../../zwanga-backend');
const backendRequire = createRequire(join(backend, 'package.json'));
const { minimalEnvironment } = backendRequire('./test/load/isolation.cjs');
const pause = ms => new Promise(done => setTimeout(done, ms));

async function run() {
  const pgBin = process.argv[2];
  if (!pgBin) throw Error('Usage: node scripts/test-auth-local.cjs <PostgreSQL bin directory>');
  const port = await new Promise((done, reject) => {
    const probe = createServer(); probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => { const chosen = probe.address().port; probe.close(() => done(chosen)); });
  });
  const password = randomBytes(24).toString('hex');
  const command = process.platform === 'win32' ? 'wsl.exe' : 'redis-server';
  const args = process.platform === 'win32' ? ['-d', 'Ubuntu', '--exec', 'redis-server', '-'] : ['-'];
  const server = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'], env: minimalEnvironment() });
  let error;
  server.on('error', reason => { error = reason; });
  server.stdin.on('error', reason => { error = reason; });
  server.stdin.end(`bind 127.0.0.1\nport ${port}\nsave ""\nappendonly no\nprotected-mode yes\nrequirepass ${password}\nmaxmemory 32mb\nmaxmemory-policy noeviction\n`);
  const client = backendRequire('redis').createClient({ socket: { host: '127.0.0.1', port, reconnectStrategy: false, connectTimeout: 1000 }, password });
  client.on('error', () => {});
  try {
    for (let i = 0; i < 40; i++) {
      if (error) throw error;
      if (server.exitCode !== null) throw Error('Disposable Redis stopped before readiness');
      try { await client.connect(); break; }
      catch (reason) { if (i === 39) throw reason; await pause(250); }
    }
    if (await client.ping() !== 'PONG') throw Error('Redis not ready');
    const child = spawn(process.execPath, [join(__dirname, '../tests/integration/authOtpLocal.cjs')], {
      cwd: resolve(__dirname, '..'), windowsHide: true, stdio: 'inherit',
      env: minimalEnvironment({ NODE_ENV: 'test', TZ: 'UTC', AWS_EC2_METADATA_DISABLED: 'true',
        AUTH_TEST_PG_BIN: resolve(pgBin), AUTH_TEST_REDIS_PORT: String(port), AUTH_TEST_REDIS_PASSWORD: password }),
    });
    process.exitCode = await new Promise((done, reject) => { child.on('error', reject); child.on('exit', code => done(code ?? 1)); });
  } finally {
    if (client.isOpen) {
      await client.sendCommand(['SHUTDOWN', 'NOSAVE']).catch(() => {});
      if (client.isOpen) await client.disconnect();
    }
    server.kill();
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
