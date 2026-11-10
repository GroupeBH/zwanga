'use strict';
// Real mobile query builders -> HTTP -> production controllers/services -> real
// disposable SQL/Redis. SMS, referrals, uploads, OAuth and KYC I/O are not exercised.
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const backend = resolve(__dirname, '../../../zwanga-backend');
const br = createRequire(join(backend, 'package.json'));
const { loader } = require('../helpers/loadTypeScript.cjs');
const { hookHarness } = require('../helpers/hookHarness.cjs');
if (!process.env.AUTH_TEST_PG_BIN || !process.env.AUTH_TEST_REDIS_PASSWORD) {
  throw Error('Run only via scripts/test-auth-local.cjs with disposable infrastructure');
}
require('../helpers/localOnlyNetwork.cjs');
br('ts-node').register({ project: join(backend, 'tsconfig.json'), transpileOnly: true });
br('reflect-metadata');
const { Test } = br('@nestjs/testing');
const { ValidationPipe, Logger } = br('@nestjs/common');
const { ConfigService } = br('@nestjs/config');
const { JwtService } = br('@nestjs/jwt');
const { DataSource, EntitySchema } = br('typeorm');
const { IsolatedPostgres } = br('./test/isolated-postgres.ts');
const { AuthService } = br('./src/auth/auth.service.ts');
const { AuthController } = br('./src/auth/auth.controller.ts');
const { OAuthExchangeService } = br('./src/auth/oauth-exchange.service.ts');
const { UsersService } = br('./src/users/users.service.ts');
const { UsersController } = br('./src/users/users.controller.ts');
const { DiditKycService } = br('./src/users/didit-kyc.service.ts');
const { User } = br('./src/users/entities/user.entity.ts');
const { OtpService } = br('./src/otp/otp.service.ts');
const { MobishastraOtpService } = br('./src/otp/mobishastra-otp.service.ts');
const { RedisService } = br('./src/common/services/redis.service.ts');
const pg = new IsolatedPostgres(process.env.AUTH_TEST_PG_BIN);
const client = br('redis').createClient({ socket: { host: '127.0.0.1', port: Number(process.env.AUTH_TEST_REDIS_PORT), reconnectStrategy: false }, password: process.env.AUTH_TEST_REDIS_PASSWORD });
client.on('error', () => {});
const forbidden = () => { throw Error('Unexpected external dependency in local auth test'); };
const external = new Proxy({}, { get: (_target, key) => key === 'then' ? undefined : forbidden });
let app, db, boundary, passed = 0;
async function check(name, task) { await task(); passed++; console.log(`PASS ${name}`); }

async function run() {
  Logger.overrideLogger(false);
  const empty = await pg.start();
  await empty.destroy();
  const text = { type: 'text', nullable: true };
  db = new DataSource({ ...empty.options, extra: { max: 4 }, synchronize: true, entities: [new EntitySchema({
    name: 'User', target: User, tableName: 'users', columns: {
      id: { type: 'uuid', primary: true, generated: 'uuid' }, phone: { ...text, unique: true },
      email: { ...text, unique: true }, firstName: { type: 'text' }, lastName: { type: 'text' }, gender: text,
      role: { type: 'text' }, status: { type: 'text' }, isDriver: { type: 'boolean', default: false },
      isActive: { type: 'boolean', default: true }, isPhoneVerified: { type: 'boolean', default: false },
      driverOnboardingRequestedAt: { type: 'timestamptz', nullable: true }, lastLoginAt: { type: 'timestamptz', nullable: true },
      password: { ...text, select: false }, refreshToken: { ...text, select: false },
      accessToken: { ...text, select: false }, lastPinResetTokenHash: { ...text, select: false }, fcmToken: text,
    },
  })] });
  await db.initialize(); await client.connect();
  const redis = Object.assign(Object.create(RedisService.prototype), { client });
  const config = new ConfigService({ OTP_PROVIDER: 'mobishastra', OTP_PIN_RESET_PROVIDER: 'mobishastra',
    OTP_CODE_HMAC_SECRET: randomBytes(32).toString('hex'), OTP_SEND_COOLDOWN_SECONDS: 1,
    JWT_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    REGISTRATION_PHONE_OTP_REQUIRED: 'false' });
  const sms = [];
  const mobi = new MobishastraOtpService(config, redis, { assertConfigured() {}, async sendCode(phone, code, purpose) { sms.push({ phone, code, purpose }); } });
  const otp = new OtpService(config, redis, external, mobi);
  const repository = db.getRepository(User);
  const users = Object.assign(Object.create(UsersService.prototype), { userRepository: repository, otpService: otp });
  const referrals = { async assertReferralAttribution() {}, async registerUserInTransaction() {} };
  const auth = new AuthService(repository, external, new JwtService(), config, external, external, referrals, otp, redis);
  const module = await Test.createTestingModule({ controllers: [AuthController, UsersController], providers: [
    { provide: AuthService, useValue: auth }, { provide: UsersService, useValue: users },
    { provide: OAuthExchangeService, useValue: {} }, { provide: DiditKycService, useValue: {} },
  ] }).compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  await app.listen(0, '127.0.0.1');
  const port = app.getHttpServer().address().port;
  boundary = br('./test/load/isolation.cjs').restrictConnections([port, db.options.port, process.env.AUTH_TEST_REDIS_PORT]);
  const builder = { mutation: value => value, query: value => value };
  let endpoints;
  const load = loader({ '../../services/tokenStorage': {}, '../../services/tokenRefresh': {},
    '../../store/slices/authSlice': {}, './userApi': {}, './profileMapper': {}, './identityContracts': {},
    './baseApi': { baseApi: { injectEndpoints: definition => { endpoints = definition.endpoints(builder); return {}; } } },
  });
  load('store/api/authApi.ts');
  Object.assign(endpoints, load('store/api/user/getProfileSummary.endpoints.ts').buildGetProfileSummaryEndpoints(builder));
  let lastResetToken;
  const baseQuery = async request => {
    const multipart = request.body instanceof FormData;
    const reply = await fetch(`http://127.0.0.1:${port}/api/v1${request.url}`, {
      method: request.method, headers: multipart ? undefined : { 'Content-Type': 'application/json' },
      body: multipart ? request.body : JSON.stringify(request.body), signal: AbortSignal.timeout(10000),
    });
    const data = await reply.json();
    return reply.ok ? { data } : { error: { status: reply.status, data } };
  };
  const invoke = async (name, payload) => {
    const definition = endpoints[name];
    const result = definition.queryFn ? await definition.queryFn(payload, {}, {}, baseQuery) : await baseQuery(definition.query(payload));
    if (result.error) throw result.error;
    if (name === 'verifyPinResetOtp') lastResetToken = result.data.resetToken;
    return result.data;
  };
  const lastCode = () => sms.at(-1).code;
  const phone = '+243900000071', other = '+243900000072';
  const form = (number, proof) => {
    const body = new FormData();
    Object.entries({ phone: number, pin: '0123', firstName: 'Local', lastName: 'Test', role: 'passenger',
      ...(proof ? { phoneVerificationToken: proof } : {}) }).forEach(([key, value]) => body.set(key, value));
    return body;
  };
  let phoneProof;
  await check('inscription: code Mobishastra 5 chiffres, erreur, preuve liee au numero', async () => {
    const result = await invoke('sendPhoneVerificationOtp', { phone, context: 'registration' });
    assert.equal(result.codeLength, 5); assert.match(lastCode(), /^\d{5}$/);
    const wrong = lastCode() === '11111' ? '22222' : '11111';
    await assert.rejects(invoke('verifyPhoneOtp', { phone, otp: wrong }), { status: 400 });
    const verified = await invoke('verifyPhoneOtp', { phone, otp: lastCode() });
    assert.equal(verified.valid, true); phoneProof = verified.verificationToken;
    await assert.rejects(invoke('register', form(other, phoneProof)), { status: 400 });
    await assert.rejects(invoke('verifyPhoneOtp', { phone, otp: lastCode() }), { status: 400 });
  });
  await check('inscription multipart puis connexion: compte verifie, mot de passe hashe, numero unique', async () => {
    assert.ok((await invoke('register', form(phone, phoneProof))).accessToken);
    const account = await repository.findOneByOrFail({ phone });
    assert.equal(account.isPhoneVerified, true); assert.equal(account.password, undefined);
    const [stored] = await db.query('SELECT password FROM users WHERE phone=$1', [phone]);
    assert.notEqual(stored.password, '0123'); assert.equal(await br('bcrypt').compare('0123', stored.password), true);
    assert.ok((await invoke('login', { phone, pin: '0123' })).accessToken);
    await assert.rejects(invoke('register', form(phone, phoneProof)), { status: 401 });
    assert.equal(await repository.countBy({ phone }), 1);
  });
  await check('anciens mobiles: inscription sans preuve compatible mais numero non verifie', async () => {
    await invoke('register', form(other));
    assert.equal((await repository.findOneByOrFail({ phone: other })).isPhoneVerified, false);
    const extra = form('+243900000073'); extra.set('isPhoneVerified', 'true');
    await assert.rejects(invoke('register', extra), { status: 400 });
  });
  // The real mobile reset hook runs against the HTTP API, not canned mutation responses.
  const hooks = hookHarness();
  const mutation = name => () => [payload => ({ unwrap: () => invoke(name, payload), reset() {} }), { isLoading: false }];
  const { usePinResetFlow } = loader({ react: hooks.react, '@/store/api/authApi': {
    useRequestPinResetOtpMutation: mutation('requestPinResetOtp'), useVerifyPinResetOtpMutation: mutation('verifyPinResetOtp'), useResetPinMutation: mutation('resetPin'),
  } })('hooks/auth/usePinResetFlow.ts');
  const flow = () => hooks.render(() => usePinResetFlow(phone, true));
  await check('reinitialisation: 6 chiffres Mobishastra, aucun changement sans OTP valide', async () => {
    // Wait for the configured one-second test cooldown; do not disable rate protection.
    await new Promise(done => setTimeout(done, 1100));
    await flow().requestOtp(); assert.equal(sms.at(-1).purpose, 'pin_reset'); assert.match(lastCode(), /^\d{6}$/);
    await assert.rejects(flow().verifyOtp(lastCode() === '111111' ? '222222' : '111111'), { status: 400 });
    await assert.rejects(flow().confirmPin('0456'));
    await assert.rejects(invoke('verifyPhoneOtp', { phone, otp: lastCode() }), { status: 400 });
    assert.ok((await invoke('login', { phone, pin: '0123' })).accessToken);
  });
  await check('reinitialisation mobile -> HTTP -> SQL: nouveau mot de passe, sessions revoquees, aucun rejeu', async () => {
    await flow().verifyOtp(lastCode());
    await flow().confirmPin('0456');
    const [stored] = await db.query('SELECT "accessToken","refreshToken" FROM users WHERE phone=$1', [phone]);
    assert.equal(stored.accessToken, null); assert.equal(stored.refreshToken, null);
    await assert.rejects(invoke('resetPin', { resetToken: lastResetToken, newPin: '9999' }), { status: 400 });
    await assert.rejects(flow().confirmPin('9999'));
    await assert.rejects(invoke('login', { phone, pin: '0123' }), { status: 401 });
    assert.ok((await invoke('login', { phone, pin: '0456' })).accessToken);
  });
  hooks.unmount();
  await check('numero inconnu: reponse generique sans SMS, aucun fallback Keccel/externe', async () => {
    const sent = sms.length;
    assert.ok((await invoke('requestPinResetOtp', { phone: '+243900000074' })).message);
    assert.equal(sms.length, sent); assert.equal(boundary.count(), 0);
  });
  console.log(`${passed} scenarios HTTP/SQL/Redis passes; aucun SMS reel.`);
}
run().catch(error => { console.error(error instanceof Error ? error.stack : JSON.stringify(error)); process.exitCode = 1; })
  .finally(async () => {
    try { await Promise.allSettled([app?.close(), client.isOpen ? client.quit() : undefined, db?.isInitialized ? db.destroy() : undefined]); }
    finally { boundary?.restore(); await pg.stop(); }
  });
