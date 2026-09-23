const test=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./helpers/loadTypeScript.cjs');
const {hookHarness}=require('./helpers/hookHarness.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function environment() {
  const h=hookHarness(),requests=[],dialogs=[],events=[];
  let active=true,user='account-a';
  const load=loader({react:h.react,'expo-linking':{createURL:()=>''},'react-native':{Platform:{OS:'ios'},StyleSheet:{create:v=>v}}});
  const {useWalletScreenScope}=load('hooks/wallet/useWalletScreenScope.ts');
  const {useWalletTopUpMonitoring}=load('hooks/wallet/useWalletTopUpMonitoring.ts');
  const props={mountedRef:{current:true},pollingRunIdRef:{current:0},
    stopTopUpAutoCheck(){props.pollingRunIdRef.current++},clearStoredTopUp:async()=>events.push('clear'),
    refreshAll:async()=>events.push('refresh'),showDialog:d=>dialogs.push(d),
    checkWalletTopUpStatus:()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
      const request={unwrap:()=>promise,abort(){events.push('abort')},resolve,reject};requests.push(request);return request}};
  for(const name of ['setTopUpOrderNumber','setTopUpPaymentUrl','setTopUpStage','setTopUpAutoCheckAttempt','setTopUpStatusMessage','setActiveModal','setIsAutoCheckingTopUp']) props[name]=value=>events.push([name,value]);
  return {h,props,requests,dialogs,events,setActive:value=>{active=value},setUser:value=>{user=value},
    render:()=>h.render(()=>useWalletTopUpMonitoring({...props,captureScope:useWalletScreenScope(user,active)}))};
}
for(const change of ['unmount','blur','account']) for(const status of ['succeeded','error']) {
  test(`wallet ${status} after ${change} cannot open a global dialog or clear another payment`,async()=>{
    const e=environment();const work=e.render().checkTopUpByOrderNumber('order');
    if(change==='unmount')e.h.unmount();else{if(change==='blur')e.setActive(false);else e.setUser('b');e.render()}
    const count=e.events.length;
    if(status==='error')e.requests[0].reject({status:'TIMEOUT_ERROR'});else e.requests[0].resolve({payment:{status:'succeeded'}});
    await work;assert.equal(e.dialogs.length,0);assert.equal(e.events.length,count);e.h.unmount();
  });
}
test('simultaneous recovery and manual check use a single read; pending does not reload ledger',async()=>{
  const e=environment(),api=e.render();const a=api.checkTopUpByOrderNumber('order'),b=api.checkTopUpByOrderNumber('order');
  assert.equal(e.requests.length,1);e.requests[0].resolve({payment:{status:'pending',method:'mobile_money'}});
  assert.deepEqual(await Promise.all([a,b]),['pending','pending']);assert(!e.events.includes('refresh'));e.h.unmount();
});
test('topup success displays immediately, even when balance refresh is slow',async()=>{
  const e=environment();e.props.refreshAll=()=>new Promise(()=>{});
  const work=e.render().checkTopUpByOrderNumber('order');e.requests[0].resolve({payment:{status:'succeeded'}});
  assert.equal(await work,'success');assert.equal(e.dialogs.length,1);e.h.unmount();
});
test('resuming starts a fresh read and ignores the prior aborted read',async()=>{
  const e=environment();const old=e.render().checkTopUpByOrderNumber('order');
  e.setActive(false);e.render();e.setActive(true);const fresh=e.render().checkTopUpByOrderNumber('order');
  e.requests[0].resolve({payment:{status:'succeeded'}});await old;assert.equal(e.dialogs.length,0);
  e.requests[1].resolve({payment:{status:'pending',method:'card'}});assert.equal(await fresh,'pending');
  await flush();e.h.unmount();
});
