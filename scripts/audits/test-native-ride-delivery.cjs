const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const adb=process.env.RIDE_AUDIT_ADB,serial=process.env.RIDE_AUDIT_SERIAL||'emulator-5554';
if(!adb || !/^emulator-\d+$/.test(serial))throw Error('Set RIDE_AUDIT_ADB and use a local emulator only');
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:15000});
const shell=(...args)=>run('shell',...args);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Use the emulator's clock for synthetic expiry fixtures; host/device clocks can differ.
const clockOffset=Number(shell('date','+%s%3N').trim())-Date.now();
if(!Number.isFinite(clockOffset))throw Error('Cannot read emulator time');
const now=()=>Date.now()+clockOffset;
const report=[];
const record=(name,detail={})=>{report.push({name,...detail});process.stdout.write(JSON.stringify(report.at(-1))+'\n');};
const user='00000000-0000-4000-8000-000000000001';
const fresh=(overrides={})=>({driverId:user,passengerId:'00000000-0000-4000-8000-000000000002',notificationId:randomUUID(),bookingId:randomUUID(),type:'new_booking',actionProtocol:'driver-v1',nativeAlert:'driver-v6',ringUntil:new Date(now()+60000).toISOString(),rideArrival:'DESTINATION TEST LOCAL',ridePricePerSeat:'2500',ridePriceKind:'fare',rideSeats:'2',rideDepartureAt:'2026-10-28T09:00:00.000Z',...overrides});
async function inject(data,{mode='deliver',failPrimary=false}={}){
 shell('run-as','com.zwanga.audit','rm','-f','files/ride-audit-result.json');
 shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','native-payload','--es','payload',Buffer.from(JSON.stringify(data)).toString('base64'),'--es','mode',mode,'--ez','failPrimary',String(failPrimary));
 const until=Date.now()+12000;
 while(Date.now()<until){
  try {const result=JSON.parse(shell('run-as','com.zwanga.audit','cat','files/ride-audit-result.json'));if(result.notificationId===data.notificationId)return result;}catch{}
  await sleep(200);
 }
 throw Error('Native probe did not return');
}
const valid=r=>{assert.equal(r.completed,true);assert.equal(r.count,1);assert.equal(r.actions,2);assert.equal(r.restorable,true);assert.equal(r.receipt.displayed,true);};
const fullscreenVisible=()=>/topResumedActivity[^\n]*IncomingRideActivity|mResumedActivity[^\n]*IncomingRideActivity/.test(shell('dumpsys','activity','activities'));
async function clearCards(){shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','clear');await sleep(2000);}
(async()=>{
 try {
  shell('input','keyevent','KEYCODE_WAKEUP');shell('wm','dismiss-keyguard');shell('input','keyevent','KEYCODE_HOME');
  const data=fresh(), first=await inject(data);valid(first);assert.match(first.title,/Zwanga/);assert.match(first.body,/DESTINATION TEST LOCAL/);assert.match(first.title.replace(/[\u202f\u00a0]/g,' '),/2 500 FC/);record('background_visible_actionable');
  const repeated=await inject(data);valid(repeated);assert.equal(repeated.soundUntil,first.soundUntil);assert.equal(repeated.receipt.displayedAt,first.receipt.displayedAt);record('duplicate_no_new_card_or_deadline');
  assert.match(first.body.replace(/[\u202f\u00a0]/g,' '),/2 500 FC/);assert.match(first.body,/2 places/);assert.match(first.body,/10:00/);
  assert.deepEqual(first.actionTitles,['Refuser','Accepter']);record('unlocked_summary_contains_price_seats_schedule');
  const shared=await inject(fresh({type:'trip_request_nearby',tripRequestId:randomUUID(),sharedTrip:'true'}));valid(shared);
  assert.deepEqual(shared.actionTitles,['Refuser','Voir la demande']);record('shared_actions_match_mobile');
  const fallback=await inject(fresh(),{failPrimary:true});valid(fallback);assert.equal(fallback.receipt.failureCode,'NATIVE_CARD_FAILED');record('notifee_failure_platform_fallback');
  const late=await inject(fresh({ringUntil:new Date(now()-5000).toISOString()}));valid(late);assert.equal(late.channel,'ride-native-quiet-v1');assert.equal(late.soundUntil,undefined);record('late_booking_visible_silent');
  const self=await inject(fresh({passengerId:user}));assert.equal(self.count,0);record('own_request_suppressed');
  const expired=await inject(fresh({type:'driver_dispatch_offer',offerId:randomUUID(),expiresAt:new Date(now()-1000).toISOString()}));assert.equal(expired.count,0);record('expired_offer_suppressed',{clockOffsetMs:clockOffset});
  const queued=fresh();await inject(queued,{mode:'queue'});await sleep(8000);
  const recovered=await inject(queued,{mode:'observe'});valid(recovered);record('workmanager_recovery_without_fcm_or_js');
  shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','consent','--ez','enabled','false');
  shell('input','keyevent','KEYCODE_SLEEP');await sleep(500);
  const sleeping=await inject(fresh());valid(sleeping);
  const woke=/mWakefulness=Awake/.test(shell('dumpsys','power'));record('sleep_visible_card',{screenWoke:woke});assert.equal(woke,true);
  await clearCards();
  shell('appops','set','com.zwanga.audit','USE_FULL_SCREEN_INTENT','deny');
  shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','consent','--ez','enabled','true');
  shell('input','keyevent','KEYCODE_SLEEP');await sleep(500);
  const denied=await inject(fresh());valid(denied);await sleep(2000);
  assert.equal(denied.systemFullScreenAllowed,false);assert.equal(denied.fullScreenIntent,false);
  assert.equal(fullscreenVisible(),false);record('local_consent_without_android_grant_keeps_card_only');
  await clearCards();
  shell('appops','set','com.zwanga.audit','USE_FULL_SCREEN_INTENT','allow');
  shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','consent','--ez','enabled','true');
  shell('input','keyevent','KEYCODE_SLEEP');await sleep(500);
  const fullscreen=await inject(fresh());valid(fullscreen);await sleep(2000);
  const visible=fullscreenVisible();
  assert.equal(fullscreen.systemFullScreenAllowed,true);assert.equal(fullscreen.channelReady,true);assert.equal(fullscreen.fullScreenIntent,true);
  record('sleep_fullscreen_with_permission',{visible,fullScreenIntent:fullscreen.fullScreenIntent});assert.equal(visible,true);
  for(const [name,overrides,failPrimary] of [
   ['nearby',{type:'trip_request_nearby',tripRequestId:randomUUID()},false],
   ['dispatch',{type:'driver_dispatch_offer',offerId:randomUUID(),expiresAt:new Date(now()+40000).toISOString()},false],
   ['fallback',{},true],
  ]){
   await clearCards();shell('input','keyevent','KEYCODE_SLEEP');await sleep(500);
   const result=await inject(fresh(overrides),{failPrimary});valid(result);await sleep(2000);
   assert.equal(result.fullScreenIntent,true);assert.equal(fullscreenVisible(),true);
   record(`sleep_fullscreen_${name}_with_permission`,{visible:true});
  }
  await clearCards();shell('input','keyevent','KEYCODE_WAKEUP');shell('wm','dismiss-keyguard');shell('input','keyevent','KEYCODE_HOME');
  const unlocked=await inject(fresh());valid(unlocked);await sleep(1500);
  assert.equal(unlocked.systemFullScreenAllowed,true);assert.equal(unlocked.fullScreenIntent,true);assert.equal(fullscreenVisible(),false);
  record('unlocked_phone_requests_persistent_banner_without_stealing_foreground');
 } finally {
  shell('input','keyevent','KEYCODE_WAKEUP');shell('wm','dismiss-keyguard');
  shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','clear');
  shell('am','broadcast','-n','com.zwanga.audit/.AuditReceiver','--es','operation','consent','--ez','enabled','false');
  shell('appops','set','com.zwanga.audit','USE_FULL_SCREEN_INTENT','default');
  const output=process.env.RIDE_AUDIT_OUTPUT || '.expo/ride-hardening-20261026';
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'native-matrix.json'),JSON.stringify(report,null,2)+'\n');
 }
})().catch(error=>{process.stderr.write(String(error.stack)+'\n');process.exitCode=1;});
