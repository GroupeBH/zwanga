/* global __dirname */
// Synthetic accounts only; never changes the connected user's financial data.
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID, createHash } = require('node:crypto');
const backend = createRequire(path.resolve(__dirname, '../../../zwanga-backend/package.json'));
async function createFixture() {
  const config = backend('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../../zwanga-backend/.env')));
  const url = config.DATABASE_URL ? new URL(config.DATABASE_URL) : null;
  const host = url?.hostname ?? config.DATABASE_HOST ?? 'localhost';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw Error('Local database required');
  if (!config.JWT_SECRET || !config.JWT_REFRESH_SECRET) throw Error('Local session configuration unavailable');
  const db = new (backend('pg').Client)({ ...(url ? { connectionString: url.href } : {
    host, port: Number(config.DATABASE_PORT || 5432), user: config.DATABASE_USER,
    password: config.DATABASE_PASSWORD, database: config.DATABASE_NAME,
  }), connectionTimeoutMillis: 4000, statement_timeout: 5000 });
  const actors = [], marker = 'credit-native-' + randomUUID();
  const fingerprint = token => 'sha256:' + createHash('sha256').update(token).digest('hex');
  const api = async (actor, route, method = 'GET', body) => {
    if (!route.startsWith('/asset-credits/') && route !== '/users/me') throw Error('Fixture route not allowed');
    const response = await fetch('http://127.0.0.1:5200/api/v1' + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + actor.accessToken },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw Error('Local credit HTTP ' + response.status);
    return data;
  };
  const close = async () => {
    // Preserve financial audit history; revoke only accounts created by this run.
    try {
      if (actors.length) await db.query(`UPDATE users SET "isActive"=false,status='inactive',"accessToken"=NULL,"refreshToken"=NULL,"fcmToken"=NULL
        WHERE id=ANY($1::uuid[]) AND "firstName"='Audit credit'`, [actors.map(a => a.id)]);
    } finally { await db.end(); }
  };
  try {
    await db.connect(); await db.query('BEGIN');
    for (const role of ['driver', 'super_admin']) {
      const id = randomUUID(), phone = '+243000' + String(Date.now()).slice(-6);
      const payload = { sub: id, role, phone, status: 'active', jti: randomUUID() };
      const accessToken = backend('jsonwebtoken').sign(payload, config.JWT_SECRET, { expiresIn: '1h' });
      const refreshToken = backend('jsonwebtoken').sign(payload, config.JWT_REFRESH_SECRET, { expiresIn: '1h' });
      await db.query(`INSERT INTO users(id,phone,"firstName","lastName",role,status,"isActive","isDriver","isPhoneVerified","driverCategory","accessToken","refreshToken")
        VALUES($1,$2,'Audit credit',$3,$4,'active',true,$5,true,$6,$7,$8)`,
      [id, phone, marker, role, role === 'driver', role === 'driver' ? 'transport' : null, fingerprint(accessToken), fingerprint(refreshToken)]);
      actors.push({ id, accessToken, refreshToken });
      if (role === 'driver') {
        await db.query(`INSERT INTO kyc_documents("userId",status) VALUES($1,'approved')`, [id]);
        await db.query(`INSERT INTO wallet_accounts("userId",type,balance,"withdrawableBalance",currency)
          VALUES($1,'points',10000,10000,'PTS')`, [id]);
      }
    }
    await db.query('COMMIT');
    const [driver, admin] = actors;
    for (const actor of actors) { const data = await api(actor, '/users/me'); actor.user = data.user ?? data; }
    const offer = await api(admin, '/asset-credits/admin', 'POST', { mutationId: randomUUID(), driverId: driver.id,
      assetKind: 'phone', label: 'Telephone fictif - test local', principalMinor: 100000, repaymentBps: 500,
      terms: 'Contrat fictif de recette locale. Aucun telephone reel, aucun paiement externe. Remboursement a cinq pour cent ou montant libre depuis le solde fictif.',
      validationReference: marker });
    return { driver, id: offer.id, api, close,
      detail: () => api(driver, '/asset-credits/mine/' + offer.id),
      deliver: () => api(admin, '/asset-credits/admin/' + offer.id + '/activate', 'POST', { deliveryReference: marker, assetReference: marker }),
      wallet: async () => (await db.query('SELECT balance FROM wallet_accounts WHERE "userId"=$1 AND type=$2', [driver.id, 'points'])).rows[0].balance,
    };
  } catch (e) { await db.query('ROLLBACK').catch(() => {}); await close(); throw Error(e.code ? 'Local fixture SQL ' + e.code : e.message); }
}
module.exports = { createFixture };
