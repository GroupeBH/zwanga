// Real controllers/DTOs/guards/financial services and migrations; isolated PostgreSQL only.
// The JWT strategy uses an ephemeral test key. No AppModule, .env or external providers.
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes, randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../../../zwanga-backend');
const backend = createRequire(path.join(root, 'package.json'));
backend('ts-node').register({ transpileOnly: true, project: path.join(root, 'tsconfig.json') });
backend('reflect-metadata');
const load = name => backend(path.join(root, name));
const service = (file, name) => load(`src/financing/${file}.ts`)[name];
const { IsolatedPostgres } = load('test/isolated-postgres.ts');
const { proFixture } = load('test/pro-credit-fixture.ts');
const { restrictConnections } = load('test/load/isolation.cjs');
const { Test } = backend('@nestjs/testing');
const { Logger, ValidationPipe, UnauthorizedException } = backend('@nestjs/common');
const { APP_GUARD } = backend('@nestjs/core');
const { ConfigService } = backend('@nestjs/config');
const { PassportModule, PassportStrategy } = backend('@nestjs/passport');
const { ExtractJwt, Strategy } = backend('passport-jwt');
const { JwtService } = backend('@nestjs/jwt');
const { JwtAuthGuard } = load('src/common/guards/jwt-auth.guard.ts');
const { RolesGuard } = load('src/common/guards/roles.guard.ts');

async function startCommerceBackend() {
  if (!process.env.AUDIT_POSTGRES_BIN) throw Error('Explicit disposable PostgreSQL binaries required');
  Logger.overrideLogger(false);
  const cluster = new IsolatedPostgres(process.env.AUDIT_POSTGRES_BIN);
  let app, protection;
  const close = async () => {
    try { await app?.close(); } finally {
      protection?.restore();
      for (let i = 0; ; i++) { try { await cluster.stop(); break; } catch (e) { if (!['EPERM', 'EBUSY'].includes(e.code) || i === 4) throw e; await new Promise(r => setTimeout(r, 500)); } }
    }
  };
  try {
    const db = await cluster.start(); protection = restrictConnections([db.options.port]);
    await proFixture(db);
    await db.query(`ALTER TABLE trips ADD COLUMN status text DEFAULT 'completed';
      ALTER TABLE bookings ADD COLUMN "passengerId" uuid, ADD COLUMN "pickedUp" boolean DEFAULT false,
      ADD COLUMN "droppedOff" boolean DEFAULT false, ADD COLUMN "pickedUpAt" timestamp, ADD COLUMN "droppedOffAt" timestamp;`);
    const providers = [];
    const instance = (file, name, args) => { const Class = service(file, name), value = new Class(...args); providers.push({ provide: Class, useValue: value }); return value; };
    const store = instance('shared/credit.store', 'CreditStore', [db]);
    const catalog = instance('catalogue/credit-catalogue.service', 'CreditCatalogService', [store]);
    const partners = instance('partners/credit-partners.service', 'CreditPartnersService', [store]);
    const policies = instance('policies/credit-policies.service', 'CreditPoliciesService', [store]);
    const eligibility = instance('eligibility/credit-eligibility.service', 'CreditEligibilityService', [store]);
    const ledger = instance('ledger/credit-ledger.service', 'CreditLedgerService', [store]);
    instance('applications/credit-applications.service', 'CreditApplicationsService', [store, catalog, eligibility]);
    instance('contracts/credit-contracts.service', 'CreditContractsService', [store, catalog, eligibility]);
    instance('repayments/credit-wallet-payments.service', 'CreditWalletPaymentsService', [store, catalog, ledger]);
    instance('commerce/commerce-catalogue.service', 'CommerceCatalogueService', [store, catalog]);
    instance('commerce/commerce-payments.service', 'CommercePaymentsService', [store, ledger]);
    instance('reporting/credit-reporting.service', 'CreditReportingService', [store]);
    const stock = instance('fulfilment/equipment-stock.service', 'EquipmentStockService', [store, new ConfigService({ PRO_CREDIT_IDENTITY_KEY: randomBytes(32).toString('hex') })]);
    const documents = instance('fulfilment/vehicle-documents.service', 'VehicleDocumentsService', []);
    instance('fulfilment/credit-delivery.service', 'CreditDeliveryService', [store, stock, documents]);
    const controllers = [
      ['catalogue/credit-catalogue.controller', 'CreditCatalogueController'], ['applications/credit-applications.controller', 'CreditApplicationsController'],
      ['contracts/credit-contracts.controller', 'CreditContractsController'], ['repayments/credit-repayments.controller', 'CreditRepaymentsController'],
      ['commerce/commerce-catalogue.controller', 'CommerceCatalogueController'], ['commerce/commerce-payments.controller', 'CommercePaymentsController'],
      ['fulfilment/credit-fulfilment.controller', 'CreditFulfilmentController'], ['reporting/credit-reporting.controller', 'CreditReportingController'],
      ['ledger/credit-ledger.controller', 'CreditLedgerController'],
    ].map(([file, name]) => service(file, name));
    const secret = randomBytes(32).toString('hex');
    class FixtureStrategy extends PassportStrategy(Strategy) {
      constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: secret, algorithms: ['HS256'], ignoreExpiration: false }); }
      async validate(payload) {
        const [user] = await db.query('SELECT id,role,"isActive" FROM users WHERE id=$1', [payload.sub]);
        if (!user?.isActive) throw new UnauthorizedException();
        return { userId: user.id, role: user.role };
      }
    }
    const module = await Test.createTestingModule({ imports: [PassportModule], controllers,
      providers: [...providers, FixtureStrategy, { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const port = app.getHttpServer().address().port;
    protection.restore(); protection = restrictConnections([db.options.port, port]);
    const jwt = new JwtService({ secret });
    const actor = async (role = 'driver', approved = true) => {
      const [{ id }] = await db.query('INSERT INTO users(role,"isDriver") VALUES($1,$2) RETURNING id', [role, role === 'driver']);
      if (approved) await db.query('INSERT INTO kyc_documents("userId",status) VALUES($1,\'approved\')', [id]);
      await db.query('INSERT INTO wallet_accounts("userId",balance,"withdrawableBalance") VALUES($1,100000,100000)', [id]);
      return { id, token: jwt.sign({ sub: id }, { expiresIn: '15m' }) };
    };
    const admin = await actor('super_admin'), adminActor = { userId: admin.id, role: 'super_admin' };
    const [{ id: partyId }] = await db.query('INSERT INTO partner_organizations DEFAULT VALUES RETURNING id');
    await partners.party(adminActor, partyId, { supplier: true, funder: true, operator: true, enabled: true, authorizationReference: 'LOCAL-TEST-ONLY' });
    const { id: policyId } = await policies.policy(adminActor, { version: 'commerce-test-only', terms: 'Contrat fictif de recette, aucun paiement ni bien réel. Les échéances sont réduites par chaque remboursement.', legalReference: 'LOCAL-ONLY',
      rules: { minAccountDays: 0, minSettledTrips: 0, minRevenueMinor: '0', maxActiveCredits: 5, maxPrincipalMinor: '10000000', newcomerLimitMinor: '10000000', minDepositBps: 0, maxInstallments: 12, fixedPerTripMinor: '0', netIncomeBps: 500, commissionShareBps: 0, allowBeforeDelivery: false } });
    return { actor, admin, partyId, policyId, close, baseUrl: `http://127.0.0.1:${port}/api/v1`, blockedConnections: () => protection.count(),
      proof: async () => (await db.query('INSERT INTO pro_credit_attachments("ownerId","storageKey",sha256,"mimeType") VALUES($1,$2,$3,\'image/png\') RETURNING id', [admin.id, `test/${randomUUID()}.png`, '0'.repeat(64)]))[0].id,
      wallet: async id => (await db.query('SELECT balance FROM wallet_accounts WHERE "userId"=$1', [id]))[0].balance,
      documentCase: async id => { const [v] = await db.query('INSERT INTO vehicles("ownerId") VALUES($1) RETURNING id', [id]); const [c] = await db.query('INSERT INTO pro_service_cases("ownerId") VALUES($1) RETURNING id', [id]); return { vehicleId: v.id, caseId: c.id }; },
      paidPeriod: async id => { // Simulated time boundary, new immutable fixture version; no existing production rows changed.
        for (let ordinal = 1; ordinal <= 3; ordinal++) await db.query('INSERT INTO pro_credit_installments("creditId",version,ordinal,"dueAt","amountMinor") VALUES($1,2,$2,$3,30000)', [id, ordinal, new Date(Date.now() + ((ordinal - 1) * 30 - 2) * 86400000)]);
        await db.query('UPDATE pro_credit_contracts SET "scheduleVersion"=2 WHERE "creditId"=$1', [id]);
      },
    };
  } catch (e) { await close(); throw e; }
}
module.exports = { startCommerceBackend };
