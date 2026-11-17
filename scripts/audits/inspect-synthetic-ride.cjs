/* global __dirname */
// Read-only ledger proof for exactly one recent, explicitly synthetic local ride.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { inspect } = require('./mobile-runtime-probe.cjs');
const backend = createRequire(path.resolve(__dirname, '../../../zwanga-backend/package.json'));
(async () => {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated) throw Error('Local test session required');
  const cfg = backend('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../../zwanga-backend/.env')));
  const url = cfg.DATABASE_URL ? new URL(cfg.DATABASE_URL) : null;
  const host = url?.hostname ?? cfg.DATABASE_HOST ?? 'localhost';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw Error('Loopback database required');
  const client = new (backend('pg').Client)({
    ...(url ? { connectionString: cfg.DATABASE_URL } : {
      host, port: Number(cfg.DATABASE_PORT || 5432), user: cfg.DATABASE_USER,
      password: cfg.DATABASE_PASSWORD, database: cfg.DATABASE_NAME,
    }), connectionTimeoutMillis: 4000, statement_timeout: 5000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    if (process.argv.includes('--fleet-schema')) {
      const { rows } = await client.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='fleet_registry_assignments'
          AND column_name IN ('sequence','periodicAmountMinor','paymentPeriod') ORDER BY column_name`);
      const tables = await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='fleet_external_payments') AS present`);
      const report = { timestamp: new Date().toISOString(), readOnly: true,
        periodicColumns: rows.map(row => row.column_name), paymentsTablePresent: tables.rows[0].present };
      fs.writeFileSync(path.resolve(__dirname, '../../.expo/fleet-schema-20261114.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      return;
    }
    const { rows } = await client.query(`SELECT r.status AS "requestStatus", t.status AS "tripStatus",
      b.status AS "bookingStatus", b."paymentMode", b."paymentAmount", b."grossPaymentAmount",
      b."firstTripSubsidyApplied", b."passengerPaymentRate", b."zwangaSubsidyAmount",
      b."cashReceivedAmount", b."cashReceivedAt" IS NOT NULL AS "cashReceived",
      b."pickedUp", b."droppedOff", b."pickedUpConfirmedByPassenger", b."droppedOffConfirmedByPassenger",
      (SELECT count(*)::int FROM driver_earnings e WHERE e."bookingId"=b.id) AS "earningEntries",
      (SELECT sum(e."netAmount") FROM driver_earnings e WHERE e."bookingId"=b.id) AS "netEarning",
      (SELECT count(*)::int FROM ratings rr WHERE rr."tripId"::text=t.id::text
        AND rr."raterId"=t."driverId" AND rr."ratedUserId"=b."passengerId") AS "driverRatingCount",
      (SELECT count(*)::int FROM ratings rr WHERE rr."tripId"::text=t.id::text
        AND rr."raterId"=b."passengerId" AND rr."ratedUserId"=t."driverId") AS "passengerRatingCount"
      FROM trip_requests r JOIN trips t ON t."tripRequestId"::text=r.id::text
      JOIN bookings b ON b."tripId"::text=t.id::text AND b."passengerId"=r."passengerId"
      JOIN users u ON u.id=r."passengerId"
      WHERE r.description=$1 AND r."departureLocation"=$2 AND u.phone LIKE '+243000%'
        AND r."createdAt">NOW()-INTERVAL '3 hours' LIMIT 2`,
    ['Recette locale synthétique, aucune course réelle', 'Départ audit local']);
    if (rows.length !== 1) throw Error('Expected exactly one owned synthetic ride');
    const report = { timestamp: new Date().toISOString(), readOnly: true, ...rows[0] };
    fs.writeFileSync(path.resolve(__dirname, '../../.expo/synthetic-ride-ledger-20261114.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await client.end(); }
})().catch(() => { console.error('Synthetic ledger verification unavailable; no credentials logged'); process.exitCode = 1; });
