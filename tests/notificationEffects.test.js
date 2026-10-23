const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { notificationEffects } = load('features/notifications/notificationEffects.ts');
const { getNotificationHref } = load('utils/notificationNavigation.ts');

for (const [kind, tag, href] of [['driver', 'DriverSettlement', '/driver-earnings'],
  ['referral', 'Referral', '/referrals'], ['wallet', 'Wallet', '/wallet']]) {
  for (const status of ['pending', 'succeeded', 'failed', 'cancelled', 'review']) {
    test(`${kind} withdrawal ${status}: push and inbox agree on destination and refresh`, () => {
      const payload = { type: `${kind}_withdrawal_${status}`, withdrawalId: 'withdrawal' };
      for (const data of [payload, { data: payload }]) {
        assert.ok(notificationEffects(data).tags.includes(tag));
        assert.equal(getNotificationHref(data), href);
      }
    });
  }
}
test('KYC decisions re-read identity and role instead of trusting the push payload', () => {
  for (const type of ['kyc_approved', 'kyc_rejected']) {
    const effect = notificationEffects({ type, role: 'driver', status: 'approved' });
    assert.ok(effect.tags.includes('User')); assert.ok(effect.tags.includes('KycStatus'));
    assert.ok(effect.tags.includes('Vehicle')); assert.ok(effect.tags.includes('Subscription'));
    assert.equal(effect.href, '/(tabs)/profile');
    assert.equal(Object.hasOwn(effect, 'role'), false);
  }
});
test('admin token adjustments, referral rewards and payment outcomes refresh their business balance', () => {
  assert.ok(notificationEffects({ type: 'wallet_admin_adjustment' }).tags.includes('Wallet'));
  assert.ok(notificationEffects({ type: 'referral_reward_released' }).tags.includes('Referral'));
  assert.ok(notificationEffects({ type: 'payment_succeeded', purpose: 'subscription_pro' }).tags.includes('Subscription'));
});
test('legacy chat pushes without a type invalidate only the relevant conversation and its list', () => {
  const effect = notificationEffects({ conversationId: 'chat', messageId: 'message' });
  assert.deepEqual(effect.tags, ['AccountActivity', { type: 'Message', id: 'chat' },
    { type: 'Conversation', id: 'chat' }, { type: 'Conversation', id: 'LIST' }]);
  assert.deepEqual(effect.href, { pathname: '/chat/[id]', params: { id: 'chat' } });
  assert.equal(notificationEffects({ conversationId: '../bad' }).href, null);
});
