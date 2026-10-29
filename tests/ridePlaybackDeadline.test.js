const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const user='00000000-0000-4000-8000-000000000001', id='00000000-0000-4000-8000-000000000002';
const iso=n=>new Date(n).toISOString();
const delayed=()=>{ const now=Date.now(); return {type:'new_booking',actionProtocol:'driver-v1',driverId:user,bookingId:id,
  ringUntil:iso(now-1000),nativeSoundStartedAt:iso(now-11000),nativeSoundUntil:iso(now+49000)}; };

test('a native clip started at delivery +50s survives opening at +61s, without extending on duplicates',()=>{
 const load=loader(), data=delayed(), policy=load('features/notifications/ridePlaybackDeadline.ts');
 const parse=load('features/notifications/rideAlert.ts').parseRideAlert;
 const session=load('services/rideAlertSession.ts');session.setRideAlertScreen(user,'/');
 const deadline=policy.ridePlaybackDeadline(data);assert.ok(deadline>Date.now());
 session.rememberRideAlert(parse(data),true);assert.equal(session.pendingRideAlerts(user).length,1);
 session.rememberRideAlert(parse(data),true);assert.equal(policy.ridePlaybackDeadline(data),deadline);
 session.acknowledgeRideAlerts(a=>a.id===id);session.rememberRideAlert(parse(data),true);
 assert.equal(session.pendingRideAlerts(user).length,0);
});
test('stale cards without a valid started clip remain routing candidates without ringing',()=>{
 const load=loader(), session=load('services/rideAlertSession.ts');session.setRideAlertScreen(user,'/');
 const data=delayed();delete data.nativeSoundStartedAt;delete data.nativeSoundUntil;
 session.rememberRideAlert(load('features/notifications/rideAlert.ts').parseRideAlert(data),true);
 assert.equal(session.pendingRideAlerts(user).length,0);assert.equal(session.pendingRideEntryAlerts(user).length,1);
});
test('invalid native timestamps cannot revive a sound or exceed 60 seconds or business expiry',()=>{
 const deadline=loader()('features/notifications/ridePlaybackDeadline.ts').ridePlaybackDeadline;
 const data=delayed();
 for(const bad of [{nativeSoundStartedAt:iso(Date.now()+1000)},{nativeSoundUntil:iso(Date.now()+3600000)},{nativeSoundUntil:'invalid'}])
  assert.equal(deadline({...data,...bad}),Date.parse(data.ringUntil));
 const expiry=iso(Date.now()+3000);assert.equal(deadline({...data,expiresAt:expiry}),Date.parse(expiry));
 assert.ok(deadline({...data,alertExpiresAt:iso(Date.now()-1)})<Date.now());
});
test('nearby requests and exclusive offers share the same restoration deadline',()=>{
 const load=loader(),data=delayed();const expected=Date.parse(data.nativeSoundUntil);
 const invitation=load('features/notifications/driverInvitation.ts').parseDriverInvitation(data);
 assert.equal(Date.parse(invitation.ringUntil),expected);
 const nearby=load('features/notifications/rideSound.ts').parseNearbyPhoneAlert({...data,type:'trip_request_nearby',
  tripRequestId:id,ringAlert:'nearby-request-v1',delivery:'driver-phone-v3'});
 assert.equal(Date.parse(nearby.ringUntil),expected);
 assert.equal(load('features/notifications/rideSound.ts').parseNearbyPhoneAlert({...data,type:'trip_request_nearby',tripRequestId:id,
  ringAlert:'nearby-request-v1',delivery:'driver-phone-v3',alertExpiresAt:'invalid'}),null);
});
