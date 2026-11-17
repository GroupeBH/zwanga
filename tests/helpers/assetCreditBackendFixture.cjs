// Real credit controller, JWT/role guards, DTOs, migrations and disposable PostgreSQL.
// No AppModule, .env, SMS, push, payment provider or habitual database.
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes, randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../../../zwanga-backend');
const backend = createRequire(path.join(root, 'package.json'));
backend('ts-node').register({ transpileOnly: true, project: path.join(root, 'tsconfig.json') });
backend('reflect-metadata');
const load = name => backend(path.join(root, name));
const { IsolatedPostgres } = load('test/isolated-postgres.ts');
const { restrictConnections } = load('test/load/isolation.cjs');
const { Test } = backend('@nestjs/testing');
const { Logger, ValidationPipe, UnauthorizedException } = backend('@nestjs/common');
const { APP_GUARD } = backend('@nestjs/core');
const { PassportModule, PassportStrategy } = backend('@nestjs/passport');
const { ExtractJwt, Strategy } = backend('passport-jwt');
const { JwtService } = backend('@nestjs/jwt');
const { JwtAuthGuard } = load('src/common/guards/jwt-auth.guard.ts');
const { RolesGuard } = load('src/common/guards/roles.guard.ts');
const { AssetCreditService } = load('src/asset-credit/asset-credit.service.ts');
const { AssetCreditController } = load('src/asset-credit/asset-credit.controller.ts');

async function startAssetCreditBackend() {
  if (!process.env.AUDIT_POSTGRES_BIN) throw Error('Explicit disposable PostgreSQL binaries required');
  Logger.overrideLogger(false);
  const cluster = new IsolatedPostgres(process.env.AUDIT_POSTGRES_BIN);
  let app, protection;
  const close = async () => {
    try { await app?.close(); }
    finally {
      protection?.restore();
      // PostgreSQL is stopped before deletion; Windows can retain handles briefly.
      // The shared helper validates its own unique temporary path on every attempt.
      for (let attempt = 0; ; attempt++) {
        try { await cluster.stop(); break; }
        catch (error) {
          if (!['EPERM', 'EBUSY'].includes(error.code) || attempt === 4) throw error;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  };
  try {
    const db = await cluster.start();
    protection = restrictConnections([db.options.port]);
    // Minimal dependent tables, as in the backend asset-credit PostgreSQL suite.
    // The actual credit tables/functions/triggers are always created by real migrations.
    await db.query(`CREATE EXTENSION "uuid-ossp";
      CREATE TABLE users(id uuid PRIMARY KEY,role text,"isDriver" boolean DEFAULT true,"isActive" boolean DEFAULT true);
      CREATE TABLE kyc_documents(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),"userId" uuid,status text,"createdAt" timestamptz DEFAULT now());
      CREATE TABLE trips(id uuid PRIMARY KEY,"driverId" uuid);
      CREATE TABLE bookings(id uuid PRIMARY KEY,"tripId" uuid,"paymentMode" text DEFAULT 'cash',status text DEFAULT 'completed',"paymentCurrency" text DEFAULT 'CDF',"cashReceivedAt" timestamptz,"cashReceivedAmount" numeric(12,2),"cashReceivedByDriverId" uuid);
      CREATE TABLE wallet_accounts(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),"userId" uuid,type text DEFAULT 'points',balance numeric(12,2) DEFAULT 0,"withdrawableBalance" numeric(12,2) DEFAULT 0,"reservedCashCommissionBalance" numeric(12,2) DEFAULT 0,"withdrawalsBlocked" boolean DEFAULT false,currency text DEFAULT 'PTS',"updatedAt" timestamptz DEFAULT now(), UNIQUE("userId",type), CHECK(balance>=0 AND "withdrawableBalance">=0 AND "withdrawableBalance"<=balance));
      CREATE TABLE wallet_ledger_entries(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),"accountId" uuid,"userId" uuid,"accountType" text,type text,amount numeric(12,2),"withdrawableAmount" numeric(12,2),"balanceAfter" numeric(12,2),currency text,"relatedEntityType" text,"relatedEntityId" uuid,description text,CONSTRAINT "CHK_wallet_ledger_type" CHECK(type IN ('top_up')));
      CREATE TABLE driver_earnings(id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),"driverId" uuid,"bookingId" uuid UNIQUE,"grossAmount" numeric(12,2),"netAmount" numeric(12,2),"commissionAmount" numeric(12,2),currency text DEFAULT 'CDF',status text DEFAULT 'available',"createdAt" timestamptz DEFAULT clock_timestamp(), CHECK("grossAmount"="netAmount"+"commissionAmount"));`);
    for (const [stamp, name] of [['1780000124000', 'AssetCredits'], ['1780000127000', 'EquipmentAssetCredits'], ['1780000129000', 'ContractAssetCreditRates'], ['1780000130000', 'AssetCreditCostDisclosure']]) {
      const Migration = load(`src/database/migrations/${stamp}-${name}.ts`)[name + stamp];
      await db.transaction(manager => new Migration().up(manager.queryRunner));
    }
    const secret = randomBytes(32).toString('hex');
    class FixtureStrategy extends PassportStrategy(Strategy) {
      constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: secret, algorithms: ['HS256'], ignoreExpiration: false }); }
      async validate(payload) {
        const [user] = await db.query('SELECT id,role,"isActive" FROM users WHERE id=$1', [payload.sub]);
        if (!user?.isActive) throw new UnauthorizedException();
        return { userId: user.id, role: user.role };
      }
    }
    const service = new AssetCreditService(db);
    const module = await Test.createTestingModule({ imports: [PassportModule], controllers: [AssetCreditController],
      providers: [FixtureStrategy, { provide: AssetCreditService, useValue: service },
        { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const port = app.getHttpServer().address().port;
    protection.restore(); protection = restrictConnections([db.options.port, port]);
    const jwt = new JwtService({ secret });
    const actor = async (role = 'driver', approved = true) => {
      const id = randomUUID();
      await db.query('INSERT INTO users(id,role,"isDriver") VALUES($1,$2,$3)', [id, role, role === 'driver']);
      if (approved) await db.query('INSERT INTO kyc_documents("userId",status) VALUES($1,$2)', [id, 'approved']);
      await db.query('INSERT INTO wallet_accounts("userId",balance,"withdrawableBalance") VALUES($1,100000,100000)', [id]);
      return { id, token: jwt.sign({ sub: id }, { expiresIn: '15m' }) };
    };
    return { actor, close, baseUrl: `http://127.0.0.1:${port}/api/v1`, blockedConnections: () => protection.count(),
      wallet: async userId => (await db.query('SELECT balance,"withdrawableBalance" FROM wallet_accounts WHERE "userId"=$1', [userId]))[0] };
  } catch (error) { await close(); throw error; }
}
module.exports = { startAssetCreditBackend };
