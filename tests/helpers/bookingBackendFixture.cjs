// Real controller, JWT guard, DTOs, service, subscriber and disposable PostgreSQL.
// Cache storage and external providers are replaced; no AppModule, .env or cron workers.
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '../../../zwanga-backend');
const backend = createRequire(path.join(root, 'package.json'));
backend('ts-node').register({ transpileOnly: true, project: path.join(root, 'tsconfig.json') });
backend('reflect-metadata');
const load = name => backend(path.join(root, name));
const { IsolatedPostgres } = load('test/isolated-postgres.ts');
const { restrictConnections } = load('test/load/isolation.cjs');
const { Test } = backend('@nestjs/testing');
const { Logger, ValidationPipe } = backend('@nestjs/common');
const { ConfigService } = backend('@nestjs/config');
const { PassportModule, PassportStrategy } = backend('@nestjs/passport');
const { ExtractJwt, Strategy } = backend('passport-jwt');
const { JwtService } = backend('@nestjs/jwt');
const { typeOrmEntities } = load('src/database/entities.ts');
const { Booking } = load('src/bookings/entities/booking.entity.ts');
const { Trip } = load('src/trips/entities/trip.entity.ts');
const { User } = load('src/users/entities/user.entity.ts');
const { Notification } = load('src/notifications/entities/notification.entity.ts');
const { PassengerTripInterruptionRequest, DriverTripInterruptionRequest } = load('src/trips/entities/trip-interruption.entity.ts');
const { BookingsService } = load('src/bookings/bookings.service.ts');
const { BookingsController } = load('src/bookings/bookings.controller.ts');
const { CacheService } = load('src/common/services/cache.service.ts');
const { RideDeclarationsService } = load('src/ride-declarations/ride-declarations.service.ts');
const { TransactionalNotificationsSubscriber } = load('src/notifications/transactional-notifications.subscriber.ts');
const { BookingPriceProposal1780000113000 } = load('src/database/migrations/1780000113000-BookingPriceProposal.ts');

async function startBookingBackend() {
  if (!process.env.AUDIT_POSTGRES_BIN) throw Error('Explicit disposable PostgreSQL binaries required');
  Logger.overrideLogger(false);
  const cluster = new IsolatedPostgres(process.env.AUDIT_POSTGRES_BIN);
  let app, protection, subscriber;
  const close = async () => {
    try { await app?.close(); subscriber?.onModuleDestroy(); }
    finally {
      protection?.restore();
      // Windows may retain a short-lived handle after pg_ctl has stopped the server.
      for (let attempt = 0; ; attempt++) {
        try { await cluster.stop(); break; }
        catch (error) {
          if (error.code !== 'EPERM' || attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
  };
  try {
    const db = await cluster.start(), repo = entity => db.getRepository(entity);
    protection = restrictConnections([db.options.port]);
    db.setOptions({ entities: typeOrmEntities }); await db.buildMetadatas();
    await db.query('CREATE EXTENSION postgis; CREATE EXTENSION "uuid-ossp"');
    await db.synchronize();
    await db.query('ALTER TABLE bookings DROP COLUMN "proposedPricePerSeat"');
    await db.transaction(manager => new BookingPriceProposal1780000113000().up(manager.queryRunner));
    subscriber = new TransactionalNotificationsSubscriber(db);
    const noop = async () => undefined;
    const forbidden = new Proxy({}, { get: (_target, key) => key === 'registerSettlement' ? noop : () => {
      throw Error('External provider not permitted in booking test: ' + String(key));
    } });
    // Real invalidation logic; serialized in-memory entries, no Redis or TTL clock.
    const entries = new Map();
    const cache = new CacheService({
      get: async key => entries.has(key) ? JSON.parse(entries.get(key)) : undefined,
      set: async (key, value) => { entries.set(key, JSON.stringify(value)); },
      del: async key => { entries.delete(key); },
    });
    const service = new BookingsService(repo(Booking), repo(Trip), repo(User),
      repo(PassengerTripInterruptionRequest), repo(DriverTripInterruptionRequest),
      cache, forbidden, forbidden,
      forbidden, forbidden, forbidden, new ConfigService({ FIRST_TRIP_SUBSIDY_ENABLED: true }),
      forbidden, forbidden, forbidden, forbidden, forbidden, db);
    const secret = randomBytes(32).toString('hex');
    class TestJwtStrategy extends PassportStrategy(Strategy) {
      constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: secret, algorithms: ['HS256'], ignoreExpiration: false }); }
      validate(payload) { return { userId: payload.sub }; }
    }
    const module = await Test.createTestingModule({ imports: [PassportModule],
      controllers: [BookingsController], providers: [TestJwtStrategy,
        { provide: BookingsService, useValue: service },
        { provide: RideDeclarationsService, useValue: {} }],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true,
      forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    await app.listen(0, '127.0.0.1');
    const port = app.getHttpServer().address().port;
    protection.restore(); protection = restrictConnections([db.options.port, port]);
    const jwt = new JwtService({ secret });
    const actor = async role => {
      const user = await repo(User).save({ firstName: 'Synthetic', lastName: role, role });
      return { id: user.id, token: jwt.sign({ sub: user.id }, { expiresIn: '15m' }) };
    };
    const fixture = async () => {
      const driver = await actor('driver'), passenger = await actor('passenger'), stranger = await actor('driver');
      const trip = await repo(Trip).save({ driverId: driver.id, departureLocation: 'Départ test',
        arrivalLocation: 'Arrivée test', departureDate: new Date(Date.now() + 3600000),
        totalSeats: 4, availableSeats: 4, pricePerSeat: 3000, status: 'upcoming',
        departurePoint: { type: 'Point', coordinates: [15.3, -4.32] },
        arrivalPoint: { type: 'Point', coordinates: [15.35, -4.34] } });
      return { driver, passenger, stranger, trip };
    };
    return { db, service, fixture, close, actor, baseUrl: `http://127.0.0.1:${port}/api/v1`,
      cachedBooking: id => cache.get(CacheService.getBookingKey(id)),
      blockedConnections: () => protection.count(),
      booking: id => repo(Booking).findOneByOrFail({ id }),
      trip: id => repo(Trip).findOneByOrFail({ id }),
      notifications: () => repo(Notification).find(),
      notices: async bookingId => (await repo(Notification).find()).filter(n => n.data?.bookingId === bookingId),
    };
  } catch (error) {
    try { await close(); } catch (cleanupError) { console.error('Disposable test cleanup:', cleanupError.message); }
    throw error;
  }
}
module.exports = { startBookingBackend };
