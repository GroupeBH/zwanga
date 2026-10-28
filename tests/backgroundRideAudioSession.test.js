const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('actual native audio session stops on its own looper even when no UI callbacks execute', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-audio-session-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync('native/android/notifications/RideAlertAudioSession.java', 'utf8')
    .replace(/^package .*;\r?\n/m, '').replace(/^import android.*;\r?\n/gm, '');
  const stubs = `
class Context {} class Uri {}
class SystemClock { static long now; static long elapsedRealtime(){return now;} }
class HandlerThread {
  static HandlerThread latest; boolean started,quit;
  HandlerThread(String name){latest=this;} void start(){started=true;} HandlerThread getLooper(){return this;}
  void quitSafely(){quit=true;}
}
class Handler {
  static class Entry { Handler h; Runnable r; long at; Entry(Handler h,Runnable r,long at){this.h=h;this.r=r;this.at=at;} }
  static java.util.List<Entry> events=new java.util.ArrayList<>();
  Handler(HandlerThread thread){} void post(Runnable r){postDelayed(r,0);} void postDelayed(Runnable r,long ms){events.add(new Entry(this,r,SystemClock.now+ms));}
  void removeCallbacksAndMessages(Object unused){events.removeIf(e->e.h==this);}
  static void advance(long ms){
    long end=SystemClock.now+ms;
    while(true){ Entry next=events.stream().filter(e->e.at<=end).min(java.util.Comparator.comparingLong(e->e.at)).orElse(null);
      if(next==null)break;events.remove(next);SystemClock.now=next.at;next.r.run(); }
    SystemClock.now=end;
  }
}
class RideAlertAudioPlayer {
  static RideAlertAudioPlayer latest; static int created; boolean closed; Runnable ended;
  RideAlertAudioPlayer(Context c,Handler h,Uri sound,Runnable end){latest=this;created++;ended=end;}
  String state(){return closed?"stopped":"playing";} void close(){closed=true;}
}
`;
  const checks = `public class AudioSessionCheck {
  static void check(boolean v){if(!v)throw new AssertionError();}
  public static void main(String[] args){
    int[] ended={0}; boolean[] valid={true};
    RideAlertAudioSession s=new RideAlertAudioSession(new Context(),new Uri(),1200,()->valid[0],()->ended[0]++);
    Handler.advance(0); RideAlertAudioPlayer p=RideAlertAudioPlayer.latest; HandlerThread thread=HandlerThread.latest;
    check(s.state().equals("playing") && thread.started);
    Handler.advance(1199); check(!p.closed); Handler.advance(1);
    check(p.closed && s.state().equals("stopped") && ended[0]==1 && thread.quit && Handler.events.isEmpty());
    s.close(); check(ended[0]==1);
    s=new RideAlertAudioSession(new Context(),new Uri(),5000,()->valid[0],()->ended[0]++); Handler.advance(0);
    valid[0]=false; Handler.advance(500); check(s.state().equals("stopped") && ended[0]==2 && Handler.events.isEmpty());
    int created=RideAlertAudioPlayer.created;
    s=new RideAlertAudioSession(new Context(),new Uri(),5000,()->true,()->ended[0]++); s.close(); Handler.advance(0);
    check(RideAlertAudioPlayer.created==created && HandlerThread.latest.quit && ended[0]==2);
    s=new RideAlertAudioSession(new Context(),new Uri(),5000,()->{throw new RuntimeException();},()->ended[0]++);
    Handler.advance(0); check(s.state().equals("stopped") && ended[0]==3 && Handler.events.isEmpty());
  }
}`;
  const file = path.join(directory, 'AudioSessionCheck.java'); fs.writeFileSync(file, source + stubs + checks);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 }); assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'AudioSessionCheck'], { encoding: 'utf8', timeout: 30000 }); assert.equal(run.status, 0, run.stderr);
});
