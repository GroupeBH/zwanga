/* global __dirname */
// Read-only local diagnosis. No account names, coordinates, credentials or tokens in output.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');

async function main() {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated || runtime.role !== 'driver')
    throw Error('Authenticated local driver development runtime required');
  const driverId = await evaluate(`${findModule('store/index.ts')}.store.getState().auth.user?.id`);
  if (!/^[a-f0-9-]{36}$/i.test(driverId ?? '')) throw Error('Driver identifier missing');
  const backend = createRequire(path.resolve(__dirname, '../../../zwanga-backend/package.json'));
  const config = backend('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../../zwanga-backend/.env')));
  const database = config.DATABASE_URL ? new URL(config.DATABASE_URL) : null;
  const host = database?.hostname ?? config.DATABASE_HOST ?? 'localhost';
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) throw Error('Loopback database required');
  const settings = database ? { connectionString: config.DATABASE_URL } : {
    host, port: Number(config.DATABASE_PORT || 5432), user: config.DATABASE_USER,
    password: config.DATABASE_PASSWORD, database: config.DATABASE_NAME,
  };
  const { latestDriverPositionSql, nearbyRequestDriverVisibilitySql } = backend('./dist/trip-requests/request-proximity.js');
  const { requestVehicleTypesSql } = backend('./dist/trip-requests/request-vehicle-types.js');
  const client = new (backend('pg').Client)({ ...settings, connectionTimeoutMillis: 4000,
    statement_timeout: 5000, query_timeout: 6000, idle_in_transaction_session_timeout: 10000,
    application_name: 'zwanga-local-visibility-readonly' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const guard = await client.query('SHOW transaction_read_only');
    if (guard.rows[0]?.transaction_read_only !== 'on') throw Error('Read-only guard missing');
    const driver = await client.query(`SELECT u.role, u."isActive", u.status,
      p."discoveryEnabled", p.position IS NOT NULL AS "positionStored",
      ROUND(EXTRACT(EPOCH FROM(now()-p."updatedAt"))/60)::int AS "positionAgeMinutes",
      ${latestDriverPositionSql('$1')} IS NOT NULL AS "usablePosition",
      (SELECT count(*)::int FROM vehicles v WHERE v."ownerId"=u.id AND v."isActive"=true) AS "activeVehicles"
      FROM users u LEFT JOIN driver_dispatch_presence p ON p."driverId"=u.id WHERE u.id=$1`, [driverId]);
    const recent = await client.query(`SELECT status,count(*)::int AS count FROM trip_requests
      WHERE "createdAt">now()-interval '24 hours' GROUP BY status`);
    const requests = await client.query(`SELECT r."createdAt", r.status,
      r."passengerId"=$1 AS "ownRequest", r."targetDriverId" IS NOT NULL AND r."targetDriverId"<>$1 AS "targetedElsewhere",
      (r."selectedDriverId" IS NOT NULL OR r."tripId" IS NOT NULL) AS assigned,
      r."departureDateMax" > now()-interval '3 hours' AS "unexpired",
      EXISTS(SELECT 1 FROM trip_request_driver_refusals f WHERE f."requestId"=r.id AND f."driverId"=$1) AS refused,
      EXISTS(SELECT 1 FROM vehicles v WHERE v."ownerId"=$1 AND v."isActive"=true
        AND v.type::text=ANY(${requestVehicleTypesSql('r')})) AS "vehicleCompatible",
      ROUND((ST_Distance(r."departurePoint",${latestDriverPositionSql('$1')})/1000)::numeric,1) AS "distanceKm",
      (${nearbyRequestDriverVisibilitySql('r.id','$1')}) AS "passesVisibilityPolicy"
      FROM trip_requests r WHERE r."createdAt">now()-interval '24 hours'
      ORDER BY r."createdAt" DESC LIMIT 12`, [driverId]);
    const audience = await client.query(`WITH latest AS (SELECT * FROM trip_requests
      WHERE status IN ('pending','offers_received') AND "createdAt">now()-interval '24 hours'
        AND "selectedDriverId" IS NULL AND "tripId" IS NULL
        AND "departureDateMax">now()-interval '3 hours'
      ORDER BY "createdAt" DESC LIMIT 1)
      SELECT count(*)::int AS "otherDriverAccounts",
        count(*) FILTER(WHERE ${latestDriverPositionSql('d.id')} IS NOT NULL)::int AS "withUsablePosition",
        count(*) FILTER(WHERE ST_DWithin(r."departurePoint",${latestDriverPositionSql('d.id')},5000))::int AS "within5Km",
        count(*) FILTER(WHERE ${nearbyRequestDriverVisibilitySql('r.id','d.id')})::int AS "eligibleForLatestCommand"
      FROM latest r JOIN users d ON d.role='driver' AND d.id<>r."passengerId"`);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ scope: 'local database read-only; compiled backend policy', driver: driver.rows[0],
      last24Hours: recent.rows, recentRequests: requests.rows, latestCommandAudience: audience.rows[0] }));
  } finally { await client.end(); }
}

main().catch(error => { console.error('Local visibility diagnostic failed:', error.code || error.name); process.exitCode = 1; });
