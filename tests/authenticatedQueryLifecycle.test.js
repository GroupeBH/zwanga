const test=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./helpers/loadTypeScript.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function environment() {
  let version=0, tokens={accessToken:'valid',refreshToken:'refresh'}, refresh=async()=>null;
  let fetch=async()=>({data:'ok'}); const requests=[];
  const {baseQueryWithReauth}=loader({
    '../../config/env':{API_BASE_URL:'https://example.invalid'},
    '../../services/tokenStorage':{getTokens:async()=>tokens},
    '../../services/tokenSession':{getTokenSessionVersion:()=>version},
    '../../utils/jwt':{isTokenExpired:token=>token==='expired'},
    '../../services/tokenRefresh':{refreshAccessToken:token=>refresh(token)},
    '@reduxjs/toolkit/query/react':{createApi:config=>config,fetchBaseQuery:()=>async req=>{requests.push(req);return fetch(req)}},
  })('store/api/baseApi.ts');
  const controller=new AbortController();
  return {requests,controller, run:()=>baseQueryWithReauth('/bookings',{signal:controller.signal},{}),
    tokens:value=>{tokens=value}, refresh:fn=>{refresh=fn}, fetch:fn=>{fetch=fn}, changeSession:()=>version++};
}
test('offline expired session sends no protected request and returns a transient error',async()=>{
  const e=environment(); e.tokens({accessToken:'expired',refreshToken:'refresh'});
  assert.equal((await e.run()).error.status,'FETCH_ERROR'); assert.equal(e.requests.length,0);
});
test('renewal precedes an authenticated request, without an expired bearer',async()=>{
  const e=environment(); e.tokens({accessToken:'expired',refreshToken:'refresh'});
  e.refresh(async()=>{e.tokens({accessToken:'new',refreshToken:'refresh2'});return 'new'});
  assert.deepEqual(await e.run(),{data:'ok'}); assert.equal(e.requests.length,1);
  assert.equal(e.requests[0].headers.get('authorization'),'Bearer new');
});
test('an old 401 cannot retry a mutation against the next account',async()=>{
  const e=environment(); let resolve; e.fetch(()=>new Promise(r=>{resolve=r}));
  const result=e.run(); await flush(); e.changeSession(); resolve({error:{status:401}});
  assert.equal((await result).error.status,'FETCH_ERROR'); assert.equal(e.requests.length,1);
});
test('abort during renewal prevents the request from being sent',async()=>{
  const e=environment(); let resolve; e.tokens({accessToken:'expired',refreshToken:'refresh'});
  e.refresh(()=>new Promise(r=>{resolve=r})); const result=e.run(); await flush();
  e.controller.abort(); e.tokens({accessToken:'new',refreshToken:'refresh'}); resolve('new');
  await result; assert.equal(e.requests.length,0);
});
test('public requests without a session still work',async()=>{
  const e=environment(); e.tokens({accessToken:null,refreshToken:null});
  assert.deepEqual(await e.run(),{data:'ok'}); assert.equal(e.requests[0].headers.has('authorization'),false);
});
