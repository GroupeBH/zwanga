const test=require('node:test');
const assert=require('node:assert/strict');
const {loader}=require('./helpers/loadTypeScript.cjs');
const {hookHarness}=require('./helpers/hookHarness.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};

for(const operation of ['accept','reject']) test(`${operation}: slow reads do not block another reservation or allow duplicate taps`,async()=>{
  const h=hookHarness(), read=gate(), mutation=gate(), sent=[], processing=[], commits=[];
  const load=loader({react:h.react,'react-native':{Platform:{OS:'ios'},StyleSheet:{create:v=>v}},
    '../../features/driver-navigation/navigationPresentation':{getBookingActionErrorMessage:()=>''}});
  const {useDriverBookingActionGuard}=load('hooks/driver-navigation/useDriverBookingActionGuard.ts');
  const {useDriverBookingActions}=load('hooks/driver-navigation/useDriverBookingActions.ts');
  const a={id:'a',tripId:'trip',passengerId:'pa',numberOfSeats:3,status:'pending'}, b={...a,id:'b',passengerId:'pb'};
  const props={tripId:'trip',active:true,bookings:[a,b],setProcessingBookingId:id=>processing.push(id)};
  const send=id=>{sent.push(id);return{unwrap:()=>mutation.promise}};
  const actions=h.render(()=>useDriverBookingActions({beginBookingAction:useDriverBookingActionGuard(props),
    acceptBooking:send,rejectBooking:({id})=>send(id),commitBookingDecision:(...value)=>commits.push(value),
    rememberAcceptedBooking(){},lastRouteFetchTimeRef:{current:0},routeFetchedRef:{current:false},
    refetchTrip:()=>read.promise,refetchBookings:()=>read.promise,speakNavigationMessage:async()=>{},showDialog(){},reconcileBookingStatus:async()=>null}));
  const action=actions[operation==='accept'?'handleAcceptPendingBooking':'handleRejectPendingBooking'];
  const first=action(a); await action(a); assert.equal(sent.length,1);
  mutation.resolve({...a,status:operation==='accept'?'accepted':'rejected'}); await first;
  assert.equal(processing.at(-1),null); assert.equal(commits[0][0].numberOfSeats,3);
  await action(a); assert.equal(sent.length,1,'stale rendered card cannot resubmit');
  await action(b); assert.equal(sent.length,2,'other reservation is no longer locked');
  read.reject(Error('network')); await flush(); h.unmount();
});

function restartEnvironment() {
  const h=hookHarness(), pending=gate(), events=[], reads=gate();
  const {useDriverTripInterruptionActions}=loader({react:h.react,'expo-location':{},
    '@/services/driverBackgroundLocationTask':{stopDriverBackgroundLocationTracking:async()=>{}}})('hooks/driver-navigation/useDriverTripInterruptionActions.ts');
  const props={tripId:'a',isScreenActive:true,isExitingRef:{current:false},startTrip:()=>{events.push('start');return{unwrap:()=>pending.promise}},
    refetchTrip:()=>reads.promise,refetchBookings:()=>reads.promise,showDialog:()=>events.push('dialog'),reconcileTripStatus:async()=>null};
  for(const name of ['lastRouteFetchTimeRef','routeFetchedRef','routeSignatureRef','hasFetchedInitialDriverRouteRef','offRouteSampleCountRef','lastOffRouteRerouteAtRef']) props[name]={current:null};
  for(const name of ['setRouteCoordinates','setRouteDistanceMeters','setRouteDurationSeconds','setSteps','setCurrentStepIndex']) props[name]=()=>events.push(name);
  return {h,props,pending,events,reads,render:()=>h.render(()=>useDriverTripInterruptionActions(props))};
}
for(const change of ['blur','unmount','trip','blur-resume']) test(`restart late response after ${change} has no UI side effect`,async()=>{
  const e=restartEnvironment(); const work=e.render().handleRestartTripFromNavigation();
  if(change==='unmount')e.h.unmount(); else{
    if(change.startsWith('blur'))e.props.isScreenActive=false;else e.props.tripId='b';e.render();
    if(change==='blur-resume'){e.props.isScreenActive=true;e.render()}
  }
  e.pending.resolve({status:'ongoing'});await work;assert.deepEqual(e.events,['start']);e.h.unmount();
});
test('restart is single-flight and success does not wait for non-critical reads',async()=>{
  const e=restartEnvironment(), api=e.render(); const work=api.handleRestartTripFromNavigation();
  await api.handleRestartTripFromNavigation();assert.deepEqual(e.events,['start']);
  e.pending.resolve({status:'ongoing'});await work;assert(e.events.includes('dialog'));e.h.unmount();
});
