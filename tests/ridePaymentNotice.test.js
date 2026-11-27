const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { ridePaymentNotice: model } = loader()('features/ride-payment/ridePaymentNoticeModel.ts');
const booking = { id: 'booking', status: 'accepted', paymentMode: 'points', paymentStatus: 'pending', paymentAmount: 1000 };
const options = { acceptedPaymentModes: ['points'], availablePaymentModes: ['points'], commissionRate: .05 };

test('payment reminder shows expected mode and never invents a cash authorization', () => {
  assert.match(model(booking).title, /Jetons/);
  assert.match(model(booking).detail, /vérifier/);
  assert.match(model(booking, options).detail, /Cash non autorisé/);
  assert.match(model(booking, { ...options, cashFallbackAvailable: true, availablePaymentModes: ['points', 'cash'] }).detail, /passer au cash/);
  assert.equal(model({ ...booking, status: 'cancelled' }), null);
});
test('offline, provider pending, paid, mixed and free states retain clear payment boundaries', () => {
  assert.match(model({ ...booking, paymentStatus: 'succeeded' }, options, true).detail, /Hors connexion/);
  assert.match(model({ ...booking, paymentStatus: 'initiated' }, options).detail, /Ne payez pas une seconde fois/);
  assert.equal(model({ ...booking, paymentStatus: 'succeeded' }).tone, 'paid');
  assert.match(model({ ...booking, mixedPaymentAt: 'now' }).detail, /Seul le complément/);
  assert.equal(model({ ...booking, paymentAmount: 0 }).title, 'Trajet gratuit');
  for (const amount of [null, undefined, '']) assert.notEqual(model({ ...booking, paymentAmount: amount }).title, 'Trajet gratuit');
});
test('exception reminder uses server disclosure but cannot override unresolved provider or paid state', () => {
  const exceptional = { ...options, cashException: { message: 'Avertissement serveur', requiresDriverAcknowledgment: true } };
  assert.equal(model(booking, exceptional).detail, 'Avertissement serveur');
  assert.notEqual(model({ ...booking, paymentStatus: 'initiated' }, exceptional).detail, 'Avertissement serveur');
  assert.notEqual(model({ ...booking, cashReceivedAt: 'now' }, exceptional).detail, 'Avertissement serveur');
});
test('connected notice skips inactive/offline reads and ignores previous-booking or failed options', () => {
  const calls = []; let online = true, response = { data: { ...options, cashFallbackAvailable: true, availablePaymentModes: ['cash'] } };
  const { RidePaymentNotice } = loader({
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: 'passenger' } }, zwangaApi: { config: { online } } }) },
    '@/hooks/useDisplayReads': { displayReadOptions: enabled => ({ skip: !enabled }) },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: (id, opts) => { calls.push(opts); return response; } },
    './RidePaymentNoticeView': { RidePaymentNoticeView: 'Notice' },
  })('features/ride-payment/RidePaymentNotice.tsx');
  assert.match(RidePaymentNotice({ booking, active: true }).props.notice.detail, /vérifier/);
  assert.equal(calls.at(-1).skip, false);
  response = { currentData: options, isError: true };
  assert.match(RidePaymentNotice({ booking, active: true }).props.notice.detail, /vérifier/);
  RidePaymentNotice({ booking, active: false }); assert.equal(calls.at(-1).skip, true);
  online = false; assert.match(RidePaymentNotice({ booking, active: true }).props.notice.detail, /Hors connexion/);
  assert.equal(calls.at(-1).skip, true);
});
