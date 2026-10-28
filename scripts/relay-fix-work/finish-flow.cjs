const fs=require('node:fs'),path=require('node:path');const root='C:/Users/hp/projects/zwanga-backend';
const edit=(f,a,b)=>{const p=path.join(root,f),s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');if(!s.includes(a))throw Error('Missing '+f);fs.writeFileSync(p,s.replace(a,b),'utf8');};
edit('src/trip-requests/trip-requests.service.ts','await completeRequestAcceptance(manager, current, trip);', 'await completeRequestAcceptance(manager, current, await manager.findOneByOrFail(Trip, { id: trip.id }));');
edit('src/trip-requests/request-refusal.ts', '      // A deliberate refusal after the ring deadline remains a refusal.', `      await tx.query(\x60UPDATE driver_offers SET status='cancelled', "updatedAt"=clock_timestamp()
        WHERE "driverId"=$1 AND "tripRequestId"=$2 AND status='pending'\x60, [driverId, requestId]);
      // A deliberate refusal after the ring deadline remains a refusal.`);
console.log('Atomic selection uses persisted trip; withdrawn counteroffers are cancelled.');
