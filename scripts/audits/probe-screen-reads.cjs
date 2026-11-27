/* global __dirname, Buffer */
// Explicit GET allowlist. No response bodies, identities or credentials in artifacts.
const fs=require('node:fs'), path=require('node:path');
const {inspect,evaluate,findModule}=require('./mobile-runtime-probe.cjs');
const endpoints=[
  '/users/me','/users/kyc/status','/vehicles','/favorite-places','/me/activity',
  '/trips/my-trips?scope=activity&view=compact','/trips/my-trips/history?limit=10',
  '/bookings/my-bookings?scope=activity','/bookings/my-bookings/history?limit=10',
  '/trip-requests/pages/available?limit=5',
  '/pro-services/catalogue','/pro-services/mine','/pro-services/mine/current-documents',
  '/partners/me/organizations','/partners/fleet-assignments/mine','/partners/fleet-assignments/history',
  '/partners/fleets/directory?limit=20','/partners/fleet-applications/mine?limit=20',
  '/asset-credits/products','/asset-credits/mine','/asset-credits/requests',
  '/zwanga-pro/commerce/categories','/zwanga-pro/commerce/products?limit=20','/zwanga-pro/mine?limit=25',
  '/wallet/me','/wallet/ledger/page?limit=25','/wallet/withdrawals','/payments/history','/driver-finance/me',
  '/notifications?limit=20&offset=0','/conversations?page=1&limit=20',
  '/referrals/me','/referrals/me/referrals/page?limit=20','/referrals/me/rewards/page?limit=20',
  '/referrals/me/withdrawals/page?limit=20',
];
async function main(){
  const runtime=await inspect();
  if(!runtime.development||!runtime.localApi||!runtime.authenticated)throw Error('Local authenticated development runtime required');
  const token=await evaluate(`${findModule('store/index.ts')}.store.getState().auth.accessToken`);
  const results=[]; let consecutiveTransportErrors=0;
  for(const endpoint of endpoints){
    const start=performance.now();
    try{
      const response=await fetch('http://127.0.0.1:5200/api/v1'+endpoint,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token}});
      const raw=await response.text(); let count;
      try{const data=JSON.parse(raw); const items=Array.isArray(data)?data:data.items??data.data;
        if(Array.isArray(items))count=items.length;}catch{ /* No content is recorded. */ }
      results.push({endpoint,status:response.status,ms:Math.round(performance.now()-start),bytes:Buffer.byteLength(raw),...(count===undefined?{}:{count})});
      consecutiveTransportErrors=0;
    }catch{results.push({endpoint,status:'transport_error',ms:Math.round(performance.now()-start)});if(++consecutiveTransportErrors===3)break;}
  }
  const unauth=await fetch('http://127.0.0.1:5200/api/v1/users/me',{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000)}).then(r=>r.status).catch(()=> 'transport_error');
  const report={at:new Date().toISOString(),scope:'Local sequential GETs, existing confirmed test session, not load or production certification',results,withoutSession:{endpoint:'/users/me',status:unauth,expected:401}};
  fs.writeFileSync(path.resolve(__dirname,'../../.expo/screen-api-reads-2026-11-27.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}
main().catch(()=>{console.error('Local read probe failed; credentials not logged');process.exitCode=1;});
