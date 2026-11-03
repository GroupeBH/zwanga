/* Test-only loopback server. A worker keeps serving while ADB calls are synchronous.
 * Simulates the read-only verdict, NOT Firebase delivery or backend eligibility. */
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const { createServer } = require('node:http');
const { once } = require('node:events');

if (!isMainThread) {
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/notifications/ride-alerts/validate') {
      response.writeHead(404).end(); return;
    }
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 1024) request.destroy(); });
    request.on('end', () => {
      let token;
      try { token = JSON.parse(body).token; } catch { response.writeHead(400).end(); return; }
      response.writeHead(token === 'local-test-unavailable' ? 503 : 200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ allowed: token === 'local-test-allow' }));
    });
  });
  server.requestTimeout = 3000; server.headersTimeout = 3000;
  server.listen(0, '127.0.0.1', () => parentPort.postMessage(server.address().port));
} else {
  module.exports.startLocalRingValidation = async run => {
    /* global __filename */
    const worker = new Worker(__filename);
    const [port] = await once(worker, 'message');
    try { run('reverse', `tcp:${port}`, `tcp:${port}`); }
    catch (error) { await worker.terminate(); throw error; }
    return {
      addTo(data) {
        return { ...data, auditValidationBase: `http://127.0.0.1:${port}`,
          ringValidationToken: data.ringValidationToken ?? 'local-test-allow' };
      },
      async close() {
        try { run('reverse', '--remove', `tcp:${port}`); }
        finally { await worker.terminate(); }
      },
    };
  };
}
