const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const uuid = '22222222-2222-4222-8222-222222222222';
const draft = {amountMinor: 500000, paidOn: '2026-11-01', reference: 'Reçu de test', periodLabel: 'Semaine de test'};
function setup({disk = new Map(), attempts = [], uncertain = false, save = async () => {}, send = async () => {}, status = 'DECLARED'} = {}) {
  const h = hookHarness();
  let active = true, session = 1, fail = uncertain;
  const mod = loader({
    react: h.react,
    'expo-crypto': {randomUUID: () => uuid},
    '@/services/tokenSession': {getTokenSessionVersion: () => session},
    '@react-native-async-storage/async-storage': {
      getItem: async key => disk.get(key) ?? null,
      setItem: async (key,value) => {await save(); disk.set(key,value);},
      removeItem: async key => {disk.delete(key);},
    },
    '@/store/api/fleetPaymentsApi': {useDeclareFleetPaymentMutation: () => [(dto) => ({unwrap: async () => {
      assert.equal(disk.size,1); attempts.push(dto); await send();
      if(fail) {fail=false;throw {status:'TIMEOUT_ERROR'};}
      return {id:uuid,status};
    }})]},
  })('hooks/fleet/useFleetPaymentDeclaration.ts');
  const render = () => h.render(() => mod.useFleetPaymentDeclaration('driver-test','assignment-test',active));
  return {render,disk,attempts,valid:mod.validFleetDeclaration,
    blur:()=>{active=false;render();}, resume:()=>{active=true;render();}, logout:()=>{session++;}, unmount:()=>h.unmount()};
}
test('external fleet amounts and dates are validated without rounding or false received labels', () => {
  const h = setup();
  assert.equal(h.valid(draft),true);
  for(const bad of [{amountMinor:0},{amountMinor:101},{amountMinor:1e13},{paidOn:'2026-02-30'},{paidOn:'2026-2-1'},{reference:'   '},{periodLabel:'  '}])
    assert.equal(h.valid({...draft,...bad}),false);
  const model=loader()('features/pro-services/fleetPaymentModel.ts');
  assert.match(model.fleetTerms({periodicAmountMinor:'500000',paymentPeriod:'WEEKLY'}),/5\s000 FC \/ semaine/);
  assert.equal(model.fleetPaymentStatus.DECLARED,'À confirmer par le propriétaire');
  assert.equal(model.fleetPaymentStatus.CONFIRMED,'Reçu par le propriétaire');
});
test('a double click declares once and never debits a wallet',async()=>{
  const h=setup();h.render();await tick();const flow=h.render();
  await Promise.all([flow.submit(draft),flow.submit(draft)]);
  assert.equal(h.attempts.length,1);assert.equal(h.disk.size,0);
  assert.match(h.render().message,/reste à confirmer/);h.unmount();
});
test('network timeout then remount reuses exact persisted declaration even if form has changed',async()=>{
  const disk=new Map(), attempts=[];
  const h=setup({disk,attempts,uncertain:true});h.render();await tick();
  assert.equal(await h.render().submit(draft),false);
  assert.equal(disk.size,1);h.unmount();
  const next=setup({disk,attempts});next.render();await tick();
  assert.equal(await next.render().submit({...draft,amountMinor:100}),true);
  assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);assert.equal(disk.size,0);next.unmount();
});
test('blur, logout or unmount while saving prevents any new backend request',async()=>{
  for(const action of ['blur','logout','unmount']) {
    let release;
    const h=setup({save:()=>new Promise(resolve=>{release=resolve;})});
    h.render();await tick();const result=h.render().submit(draft);await tick();
    h[action]();release();assert.equal(await result,false);assert.equal(h.attempts.length,0);h.unmount();
  }
});
test('failed persistence prevents sending, and malformed saved intent blocks uncertain new submissions',async()=>{
  const h=setup({save:async()=>{throw Error('Storage unavailable');}});h.render();await tick();
  await h.render().submit(draft);assert.equal(h.attempts.length,0);h.unmount();
  const next=setup({disk:new Map([['fleet-payment-intent:driver-test:assignment-test','{"mutationId":"invalid"}']])});next.render();await tick();
  assert.equal(next.render().ready,false);await next.render().submit(draft);assert.equal(next.attempts.length,0);next.unmount();
});
test('blur and resume during in-flight declaration does not leave the interface loading forever',async()=>{
  let release;const h=setup({send:()=>new Promise(resolve=>{release=resolve;})});h.render();await tick();
  const result=h.render().submit(draft);await tick();h.blur();h.resume();release();await result;
  assert.equal(h.render().busy,false);assert.equal(h.disk.size,1);h.unmount();
});
test('fleet payment API scopes identity on the server and uses explicit external payment endpoints',()=>{
  let e;
  loader({'./baseApi':{baseApi:{injectEndpoints:({endpoints})=>{e=endpoints({query:x=>x,mutation:x=>x});return {};}}}})('store/api/fleetPaymentsApi.ts');
  assert.deepEqual(e.declareFleetPayment.query({id:'a/b',mutationId:uuid,...draft}),{
    url:'/partners/fleet-assignments/a%2Fb/payments',method:'POST',body:{mutationId:uuid,...draft},
  });
  assert.deepEqual(e.getFleetPayments.query({id:'test',before:'31'}).params,{before:'31'});
});

test('replaying a declaration already confirmed by the owner does not call it pending',async()=>{
  const h=setup({status:'CONFIRMED',disk:new Map([['fleet-payment-intent:driver-test:assignment-test',JSON.stringify({...draft,mutationId:uuid})]])});
  h.render();await tick();await h.render().submit(draft);
  assert.equal(h.render().message,'Le propriétaire a confirmé la réception.');h.unmount();
});
