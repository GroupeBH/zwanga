const test=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./helpers/loadTypeScript.cjs');
const user='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
function setup({legacy=false,receipts={}}={}){
 const sent=[];
 const load=loader({'react-native':{NativeModules:{ZwangaDriverAlerts:{getNativeRideReceipts:async()=>JSON.stringify(receipts)}}},
  './tokenSession':{getTokenSessionVersion:()=>1},
  '@/store':{store:{getState:()=>({auth:{user:{id:user}}}),dispatch:args=>{sent.push(args);return{
   unwrap:async()=>{if(legacy&&args.source)throw {status:400};return {received:true};},abort(){},reset(){}};}}},
  '@/store/api/driverDispatchApi':{driverDispatchApi:{endpoints:{recordRideNotificationReceipt:{initiate:args=>args}}}}});
 return {api:load('services/rideNotificationReceipt.ts'),sent};
}
test('native receipt reports observation time and failure code independently of upload time',async()=>{
 const at=Date.now()-30000,displayedAt=at+500;
 const {api,sent}=setup({receipts:{[id]:{at,displayedAt,displayed:true,failureCode:'NATIVE_CARD_FAILED'}}});
 await api.flushNativeRideReceipts(user);
 assert.equal(sent.length,1);assert.equal(sent[0].observedAt,new Date(displayedAt).toISOString());
 assert.equal(sent[0].source,'native');assert.equal(sent[0].stage,'displayed');assert.equal(sent[0].failureCode,'NATIVE_CARD_FAILED');
});
test('rolling deployment retries an older strict receipt endpoint once without metadata',async()=>{
 const {api,sent}=setup({legacy:true});
 await api.reportRideNotificationReceipt({notificationId:id,driverId:user},'displayed');
 assert.equal(sent.length,2);assert.equal(sent[0].source,'javascript');assert.deepEqual(sent[1],{notificationId:id,stage:'displayed'});
 await api.reportRideNotificationReceipt({notificationId:id,driverId:user},'displayed');assert.equal(sent.length,2);
});

test('audio observations upload after a displayed receipt without replaying it, with bounded enum metadata',async()=>{
 const at=Date.now()-30000;
 const receipts={[id]:{at,displayed:true,displayedAt:at+500}};
 const {api,sent}=setup({receipts});
 await api.flushNativeRideReceipts(user);assert.equal(sent.length,1);
 receipts[id].audioEvents={audio_started:{at:at+600,reason:'PLAYER_STARTED'},audio_failed:{at:at+700,reason:'secret-untrusted'},extra:{at,reason:'PLAYER_ERROR'}};
 await api.flushNativeRideReceipts(user);assert.equal(sent.length,2);
 assert.equal(sent[1].audioStage,'audio_started');assert.equal(sent[1].audioObservedAt,new Date(at+600).toISOString());
 await api.flushNativeRideReceipts(user);assert.equal(sent.length,2);
});

for (const failureCode of ['REQUEST_CHECK_UNAVAILABLE','REQUEST_NO_LONGER_AVAILABLE'])
test(`native ${failureCode} uploads even after the initial received receipt`,async()=>{
 const receipts={[id]:{at:Date.now(),displayed:false}};
 const {api,sent}=setup({receipts});
 await api.reportRideNotificationReceipt({notificationId:id,driverId:user},'received');
 receipts[id].failureCode=failureCode;
 await api.flushNativeRideReceipts(user);
 assert.equal(sent.length,2);assert.equal(sent[1].failureCode,failureCode);
 assert.equal(sent[1].stage,'received');assert.equal(sent[1].source,'native');
 await api.flushNativeRideReceipts(user);assert.equal(sent.length,2,'do not repeat unchanged observations');
});

test('new validation failure reasons remain compatible with an older strict receipt DTO',async()=>{
 const {api,sent}=setup({legacy:true,receipts:{[id]:{at:Date.now(),failureCode:'REQUEST_CHECK_UNAVAILABLE'}}});
 await api.flushNativeRideReceipts(user);
 assert.equal(sent.length,2);assert.equal(sent[0].failureCode,'REQUEST_CHECK_UNAVAILABLE');
 assert.deepEqual(sent[1],{notificationId:id,stage:'received'});
});

test('unrecognized native reasons are never forwarded',async()=>{
 const {api,sent}=setup({receipts:{[id]:{at:Date.now(),failureCode:'arbitrary-payload'}}});
 await api.flushNativeRideReceipts(user);assert.equal(sent[0].failureCode,undefined);
});
