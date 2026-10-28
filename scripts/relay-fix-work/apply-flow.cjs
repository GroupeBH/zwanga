const fs=require('node:fs'),path=require('node:path');
const root='C:/Users/hp/projects/zwanga-backend';
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s,'utf8');
const edit=(f,a,b)=>{const s=read(f);if(!s.includes(a))throw Error('Missing '+f+' '+a.slice(0,70));write(f,s.replace(a,b));};
const seq='src/trip-requests/dispatch/sequential-dispatch.service.ts';
write(seq,"import { BookingsService } from '../../bookings/bookings.service';\nimport { recoverRequestAcceptance } from './request-acceptance';\n"+read(seq));
edit(seq,'private readonly changes: RideAlertChanges) {}','private readonly changes: RideAlertChanges, private readonly bookings?: BookingsService) {}');
edit(seq,`    const retired = await manager.query(`,`    // A counteroffer is a response, with its own passenger decision deadline.
    await manager.query(\x60UPDATE driver_offers d SET status='cancelled', "updatedAt"=clock_timestamp()
      WHERE d."tripRequestId"=$1 AND d.status='pending' AND ($2 OR EXISTS (
        SELECT 1 FROM trip_request_dispatch_offers o WHERE o."requestId"=$1 AND o."driverId"=d."driverId"
          AND o.status='pending' AND o.phase='passenger' AND o."expiresAt"<=clock_timestamp()))\x60, [id, terminal]);
    const retired = await manager.query(`);
edit(seq,'($3 OR "expiresAt" <= now())','($3 OR "expiresAt" <= clock_timestamp())');
edit(seq,'        if (!this.open(request)) {',`        if (request?.sequentialDispatch) {
          const recovery = await recoverRequestAcceptance(manager, request);
          if (recovery && 'complete' in recovery) { await this.retire(manager, id, true); return null; }
          if (recovery) return recovery;
        }
        if (!this.open(request)) {`);
edit(seq,'        if (await this.provisionalTrip(manager, id)) return { wait: Date.now() + 5000 };','');
edit(seq,"      if ('wait' in state)",`      if ('bookingId' in state) {
        if (!this.bookings) throw new Error('Booking recovery service unavailable');
        await this.bookings.acceptBooking(state.bookingId, state.driverId);
        await this.queue.schedule(id, Date.now() + 1000);
        return false; // Next pass finalizes under the request lock, even after process restart.
      }
      if ('wait' in state)`);
edit(seq,`      const due = await this.queue.due(Date.now()).catch(() => [] as string[]);
      // Recover missing Redis deadlines after a crash between SQL commit and ZADD.
      const rows: { requestId: string }[] = await this.db.query(\x60SELECT "requestId" FROM trip_request_dispatch_offers
        WHERE sequential = true AND status = 'pending' AND "expiresAt" <= now()
        ORDER BY "expiresAt", id LIMIT 50\x60);`, `      // Start both reads independently: Redis timeout must not prevent the SQL recovery scan.
      const [due, rows] = await Promise.all([
        this.queue.due(Date.now()).catch(() => [] as string[]),
        this.db.query(\x60SELECT "requestId" FROM trip_request_dispatch_offers
          WHERE sequential = true AND status = 'pending' AND "expiresAt" <= now()
          ORDER BY "expiresAt", id LIMIT 50\x60) as Promise<{ requestId: string }[]>,
      ]);`);
const svc='src/trip-requests/trip-requests.service.ts';
write(svc,"import { claimRequestAcceptance, completeRequestAcceptance, silenceRequestInvitation } from './dispatch/request-acceptance';\n"+read(svc));
edit(svc,'export interface SanitizedTripRequest {',`export interface SanitizedTripRequest {
  responseWindow?: { phase: 'driver' | 'passenger' | 'accepting'; expiresAt: string; serverNow: string };`);
edit(svc,`    const result = await this.sanitizeTripRequest(tripRequest, userId);`, `    const result = await this.sanitizeTripRequest(tripRequest, userId);
    if (tripRequest.sequentialDispatch && !tripRequest.selectedDriverId) {
      const [window] = await this.tripRequestRepository.manager.query(\x60SELECT phase,"expiresAt",clock_timestamp() AS "serverNow"
        FROM trip_request_dispatch_offers WHERE "requestId"=$1 AND status='pending'
        AND ("driverId"=$2 OR ($3 AND phase='passenger')) LIMIT 1\x60, [id, userId, isPassenger]);
      if (window) result.responseWindow = { phase: window.phase, expiresAt: new Date(window.expiresAt).toISOString(),
        serverNow: new Date(window.serverNow).toISOString() };
    }`);
edit(svc,'      const result = await offers.save(offer);',`      const result = await offers.save(offer);
      if (current!.sequentialDispatch) {
        await manager.query(\x60UPDATE trip_request_dispatch_offers SET phase='passenger',
          "expiresAt"=LEAST(clock_timestamp()+interval '2 minutes',$3::timestamptz)
          WHERE "requestId"=$1 AND "driverId"=$2 AND status='pending'\x60, [tripRequestId, driverId, current!.departureDateMax]);
        await silenceRequestInvitation(manager, tripRequestId, driverId);
      }`);
edit(svc,`      await assertSequentialInvitation(manager, current!, offer.driverId);`, `      await assertSequentialInvitation(manager, current!, offer.driverId, ['passenger']);`);
// Fence slow trip preparation and carry the server-only claim through the final write.
const start=read(svc).indexOf('  async acceptTripRequest(');
let full=read(svc),head=full.slice(0,start),body=full.slice(start);
body=body.replace('    const trip = await this.tripsService.create(', `    const acceptanceToken = await claimRequestAcceptance(this.tripRequestRepository.manager, tripRequest, driverId);
    const trip = await this.tripsService.create(`);
body=body.replace('        requestSnapshot: tripRequest,','        requestSnapshot: tripRequest,\n        acceptanceToken,');
const anchor='    // Create booking for the passenger automatically with the number of seats they requested';
if(!body.includes(anchor))throw Error('Booking anchor missing');
body=body.replace(anchor,`    if (tripRequest.sequentialDispatch) {
      try {
        await this.bookingsService.create(tripRequest.passengerId, {
          tripId: trip.id, numberOfSeats: tripRequest.numberOfSeats,
          passengerOrigin: tripRequest.departureLocation, passengerDestination: tripRequest.arrivalLocation,
          passengerOriginReference: tripRequest.departureReference || undefined,
          passengerDestinationReference: tripRequest.arrivalReference || undefined,
          passengerOriginCoordinates: departureCoordinates ? { latitude: departureCoordinates[1], longitude: departureCoordinates[0] } : undefined,
          passengerDestinationCoordinates: arrivalCoordinates ? { latitude: arrivalCoordinates[1], longitude: arrivalCoordinates[0] } : undefined,
          paymentMode: tripRequest.paymentMode,
        }, {
          lockRequest: async manager => {
            await manager.findOne(TripRequest, { where: { id: tripRequestId }, lock: { mode: 'pessimistic_write' } });
          },
          validate: async (manager, currentTrip) => {
            const current = await manager.findOneByOrFail(TripRequest, { id: tripRequestId });
            assertRequestSnapshot(current, tripRequest); assertUnassignedRequest(current);
            await assertSequentialInvitation(manager, current, driverId, ['accepting'], acceptanceToken);
            if (currentTrip.driverId !== driverId || currentTrip.tripRequestId !== tripRequestId)
              throw new ConflictException('Cette commande a changé.');
          },
          selected: async manager => {
            const current = await manager.findOneByOrFail(TripRequest, { id: tripRequestId });
            await completeRequestAcceptance(manager, current, trip);
          },
        });
      } catch (error) {
        // Cache invalidation can fail after the booking/selection transaction committed.
        const committed = await this.tripRequestRepository.findOneBy({ id: tripRequestId, tripId: trip.id, selectedDriverId: driverId });
        if (!committed) {
          await this.tripsService.cancelFailedRequestTrip(trip.id, driverId, tripRequestId).catch(() => undefined);
          throw error;
        }
      }
      await this.driverDispatch?.notifyScheduledRequest(tripRequestId);
      return { trip, tripRequest: await this.findOne(tripRequestId, driverId) };
    }

`+anchor);
write(svc,head+body);
// Suppress an old claimed notification after the driver has already responded.
const ns='src/notifications/notifications.service.ts';
edit(ns,`AND \${requestDriverVisibilitySql('r.id', '$2')} AND \${sequentialInvitationSql('r.id', '$2')}\x60,`, `AND \${requestDriverVisibilitySql('r.id', '$2')} AND \${sequentialInvitationSql('r.id', '$2')}
          AND (r."sequentialDispatch"=false OR EXISTS (SELECT 1 FROM trip_request_dispatch_offers active
            WHERE active."requestId"=r.id AND active."driverId"=$2 AND active.status='pending' AND active.phase='driver'))\x60,`);
for(const file of ['src/trip-requests/dispatch/sequential-dispatch.postgres.spec.ts','src/trip-requests/dispatch/dispatch-postgres.spec.ts']) {
  write(file,"import { RequestResponsePhases1780000098000 } from '../../database/migrations/1780000098000-RequestResponsePhases';\n"+read(file));
  let s=read(file);
  if(s.includes('new SequentialRequestQueue1780000097000()')) s=s.replace('new SequentialRequestQueue1780000097000()', 'new SequentialRequestQueue1780000097000(), new RequestResponsePhases1780000098000()');
  else throw Error('Test migration anchor '+file);
  write(file,s);
}
console.log('Relay recovery, counteroffers and atomic scheduled acceptance wired.');
