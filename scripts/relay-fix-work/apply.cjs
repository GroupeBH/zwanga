const fs = require('node:fs');
const path = require('node:path');
const root = 'C:/Users/hp/projects/zwanga-backend';
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const write = (f, v) => fs.writeFileSync(path.join(root, f), v, 'utf8');
const edit = (f, a, b) => { const s=read(f); if(!s.includes(a)) throw new Error('Anchor missing '+f+': '+a.slice(0,80)); write(f,s.replace(a,b)); };
for(const [from,to] of [['acceptance.txt','src/trip-requests/dispatch/request-acceptance.ts'],['phase-migration.txt','src/database/migrations/1780000098000-RequestResponsePhases.ts']]) {
  if(fs.existsSync(path.join(root,to))) throw new Error('Already exists '+to);
  write(to,fs.readFileSync(path.join(__dirname,from),'utf8'));
}
edit('src/common/utils/redis-command-deadline.ts', "  'keys',", "  'keys',\n  'zScore',\n  'zAdd',\n  'zRangeByScore',\n  'zRem',");
edit('src/common/utils/redis-command-deadline.spec.ts', "  it('bounds a stalled command, requests recovery once and never retries it', async () => {\n    const client = { eval: jest.fn(() => new Promise(() => undefined)) };", "  it.each(['eval', 'zScore', 'zAdd', 'zRangeByScore', 'zRem'])('bounds stalled %s without retrying it', async command => {\n    const client = { [command]: jest.fn(() => new Promise(() => undefined)) };");
edit('src/common/utils/redis-command-deadline.spec.ts', 'expect(wrapped.eval())', 'expect(wrapped[command]())');
edit('src/common/utils/redis-command-deadline.spec.ts', 'expect(client.eval)', 'expect(client[command])');
const migration='src/database/migrations/index.ts';
write(migration,"import { RequestResponsePhases1780000098000 } from './1780000098000-RequestResponsePhases';\n"+read(migration));
edit(migration,'  SequentialRequestQueue1780000097000,','  SequentialRequestQueue1780000097000,\n  RequestResponsePhases1780000098000,');
const policy='src/trip-requests/dispatch/sequential-policy.ts';
edit(policy,'driverId: string) {','driverId: string, phases: string[] = [\'driver\'], token?: string) {');
edit(policy,`AND "driverId" = $2 AND status = 'pending' AND "expiresAt" > now()\x60, [request.id, driverId]);`, `AND "driverId" = $2 AND status = 'pending' AND "expiresAt" > clock_timestamp()
      AND phase = ANY($3::varchar[]) AND ($4::uuid IS NULL OR "acceptanceToken"=$4)\x60, [request.id, driverId, phases, token ?? null]);`);
const trips='src/trips/trips.service.ts';
edit(trips,'requestSnapshot?: TripRequest },','requestSnapshot?: TripRequest; acceptanceToken?: string },');
edit(trips,'saveRequestTrip(this.tripRepository, trip, options.requestSnapshot)','saveRequestTrip(this.tripRepository, trip, options.requestSnapshot, options.acceptanceToken)');
const save='src/trips/save-request-trip.ts';
edit(save,'  snapshot: TripRequest,','  snapshot: TripRequest,\n  acceptanceToken?: string,');
edit(save,'await assertSequentialInvitation(manager, request!, trip.driverId);',"await assertSequentialInvitation(manager, request!, trip.driverId, acceptanceToken ? ['accepting'] : ['driver'], acceptanceToken);");
console.log('Phase migration, Redis deadlines and acceptance helpers prepared.');
