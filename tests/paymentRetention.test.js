const test=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./helpers/loadTypeScript.cjs');
const {prunePaymentState,createPaymentStateWriter,SETTLED_PAYMENT_RETENTION_MS}=loader()('features/arrival-payment/paymentRetention.ts');
test('retention removes only old settled acknowledged states, never unresolved references or cash',()=>{
  const now=Date.now(), old=new Date(now-SETTLED_PAYMENT_RETENTION_MS-1000).toISOString(), recent=new Date(now).toISOString();
  const paid={acknowledgedAt:old,settledAt:old};
  const states={old:paid,recent:{...paid,acknowledgedAt:recent},pending:{...paid,bookingPaymentOrderNumber:'order'},
    topup:{...paid,walletTopUpOrderNumber:'wallet'},cash:{acknowledgedAt:old},required:{...paid,requiredActionAt:old},
    invalid:{...paid,settledAt:'bad-date'},legacy:{acknowledgedAt:old},empty:{}};
  const result=prunePaymentState(states,now);
  assert.deepEqual(Object.keys(result),['recent','pending','topup','cash','required','invalid','legacy']);
  assert.equal(Object.keys(states).length,9,'input is untouched');
});
test('a slow disk queues only the latest merged state, without losing pending references',async()=>{
  let release; const slow=new Promise(r=>{release=r}), saved=[];
  const write=createPaymentStateWriter(async value=>{saved.push(value);if(saved.length===1)await slow});
  write({a:{bookingPaymentOrderNumber:'a'}});
  for(let i=0;i<1000;i++)write({a:{bookingPaymentOrderNumber:'a'},b:{walletTopUpOrderNumber:`b-${i}`}});
  assert.equal(saved.length,1);release();await new Promise(r=>setImmediate(r));
  assert.equal(saved.length,2);assert.equal(saved[1].a.bookingPaymentOrderNumber,'a');assert.equal(saved[1].b.walletTopUpOrderNumber,'b-999');
});
