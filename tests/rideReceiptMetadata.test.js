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
