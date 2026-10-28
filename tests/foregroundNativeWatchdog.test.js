const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('actual Java player expires without JS heartbeats, renews only for its owner and releases on lifecycle changes', t => {
  if (spawnSync('javac', ['-version'], { encoding: 'utf8' }).status !== 0) return t.skip('JDK required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-foreground-java-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  // Compile the complete production class, not a copy of its watchdog logic.
  // Android/RN stand-ins test scheduling and ownership, NOT device audio/lifecycle.
  const source = fs.readFileSync('native/android/notifications/ForegroundAlertPlayer.java', 'utf8')
    .replace(/^package .*;\r?\n/m, '').replace(/^import .*;\r?\n/gm, '');
  const stubs = `import java.util.*;
interface Promise { void resolve(Object value); }
interface LifecycleEventListener { void onHostResume(); void onHostPause(); void onHostDestroy(); }
enum LifecycleState { RESUMED, BEFORE_RESUME }
class Looper { static Looper getMainLooper() { return new Looper(); } }
class Handler {
  static long now;
  static class Entry { Runnable run; long at; Entry(Runnable r,long a) { run=r;at=a; } }
  static List<Entry> events = new ArrayList<>();
  Handler(Looper l) {}
  void post(Runnable r) { r.run(); }
  void postDelayed(Runnable r,long ms) { events.add(new Entry(r,now+ms)); }
  void removeCallbacks(Runnable r) { events.removeIf(e -> e.run == r); }
  static void advance(long ms) {
    long end=now+ms;
    while (true) {
      Entry next=events.stream().filter(e->e.at<=end).min(Comparator.comparingLong(e->e.at)).orElse(null);
      if(next==null) break; events.remove(next); now=next.at; next.run.run();
    }
    now=end;
  }
}
class Build { static class VERSION { static int SDK_INT=34; } }
class Uri { static Uri parse(String s) { return new Uri(); } }
class Context {
  static final String NOTIFICATION_SERVICE="notification", AUDIO_SERVICE="audio", VIBRATOR_SERVICE="vibration";
}
class ReactApplicationContext extends Context {
  AudioManager audio=new AudioManager(); NotificationManager manager=new NotificationManager(); Vibrator vibrator=new Vibrator();
  LifecycleState lifecycle=LifecycleState.RESUMED;
  Object getSystemService(String name) { return name.equals(NOTIFICATION_SERVICE)?manager:name.equals(AUDIO_SERVICE)?audio:vibrator; }
  String getPackageName() { return "test"; }
  LifecycleState getLifecycleState() { return lifecycle; }
  void addLifecycleEventListener(LifecycleEventListener l) {}
  void removeLifecycleEventListener(LifecycleEventListener l) {}
}
class NotificationChannel {
  int getImportance(){return 4;} Uri getSound(){return new Uri();} String getGroup(){return null;}
  boolean shouldVibrate(){return true;} long[] getVibrationPattern(){return null;}
}
class NotificationChannelGroup { boolean isBlocked(){return false;} }
class NotificationManager {
  static final int IMPORTANCE_DEFAULT=3, INTERRUPTION_FILTER_ALL=1; boolean enabled=true;
  NotificationChannel getNotificationChannel(String s){return new NotificationChannel();}
  NotificationChannelGroup getNotificationChannelGroup(String s){return new NotificationChannelGroup();}
  boolean areNotificationsEnabled(){return enabled;} int getCurrentInterruptionFilter(){return INTERRUPTION_FILTER_ALL;}
}
class AudioManager {
  static final int RINGER_MODE_NORMAL=2, STREAM_NOTIFICATION=5;
  int getRingerMode(){return RINGER_MODE_NORMAL;} int getStreamVolume(int s){return 5;}
}
class AudioAttributes {
  static final int USAGE_NOTIFICATION=5, CONTENT_TYPE_SONIFICATION=4;
  static class Builder { Builder setUsage(int n){return this;} Builder setContentType(int n){return this;} AudioAttributes build(){return new AudioAttributes();} }
}
class VibrationEffect { static VibrationEffect createWaveform(long[] p,int r){return new VibrationEffect();} }
class Vibrator {
  boolean active; void cancel(){active=false;} void vibrate(VibrationEffect e){active=true;} void vibrate(long[] p,int r){active=true;}
}
class RideAlertAudioService { static void handoff() {} }
class MediaPlayer {
  interface OnErrorListener { boolean onError(MediaPlayer p,int what,int extra); }
  interface OnPreparedListener { void onPrepared(MediaPlayer p); }
  static MediaPlayer latest; static boolean stall; boolean playing, released; OnPreparedListener prepared;
  MediaPlayer(){latest=this;} void setAudioAttributes(AudioAttributes a){} void setDataSource(Context c,Uri u){}
  void setLooping(boolean b){} void setOnErrorListener(OnErrorListener l){} void setOnPreparedListener(OnPreparedListener l){prepared=l;}
  void prepareAsync(){if(!stall)prepared.onPrepared(this);} boolean isPlaying(){return playing;}
  void start(){if(released)throw new IllegalStateException();playing=true;} void pause(){playing=false;}
  void release(){released=true;playing=false;}
}
`;
  const checks = `public class ForegroundAlertCheck {
  static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
  static void state(ForegroundAlertPlayer p,String token,String expected){p.state(token,value->check(expected.equals(value),"state: "+value));}
  public static void main(String[] args){
    ReactApplicationContext context=new ReactApplicationContext(); ForegroundAlertPlayer p=new ForegroundAlertPlayer(context);
    p.start("one","ring",false,value->check(Boolean.TRUE.equals(value),"ready")); MediaPlayer first=MediaPlayer.latest;
    Handler.advance(14999); check(first.playing,"must keep playing during valid lease");
    Handler.advance(1); check(first.released&&!context.vibrator.active,"native watchdog stops sound AND vibration without JS");
    state(p,"one","stopped"); check(Handler.events.isEmpty(),"no retained watchdog after release");
    p.start("two","ring",false,value->{}); MediaPlayer second=MediaPlayer.latest;
    Handler.advance(10000); state(p,"two","playing"); Handler.advance(10000); check(second.playing,"health check renews lease");
    state(p,"old","stopped"); Handler.advance(5000); check(second.released,"foreign token must not renew");
    p.start("three","ring",true,value->{}); MediaPlayer third=MediaPlayer.latest;
    Handler.advance(10000); state(p,"three","paused"); Handler.advance(10000); check(!third.released,"speech pause stays healthy");
    p.stop("two"); check(!third.released,"old stop cannot stop newer player");
    p.onHostPause(); check(third.released&&Handler.events.isEmpty(),"background releases watchdog and player");
    MediaPlayer.stall=true; p.start("stalled","ring",false,value->check(Boolean.FALSE.equals(value),"prepare timeout")); MediaPlayer stalled=MediaPlayer.latest;
    Handler.advance(5000); check(stalled.released,"prepare still has its separate timeout");
    MediaPlayer.stall=false; p.start("new","ring",false,value->{}); MediaPlayer fresh=MediaPlayer.latest;
    stalled.prepared.onPrepared(stalled); check(fresh.playing,"late preparation cannot revive stale sound");
    context.manager.enabled=false; state(p,"new","stopped"); check(fresh.released,"permission changes still stop audio");
    p.destroy(); check(Handler.events.isEmpty(),"destroy clears timers");
  }
}`;
  const file = path.join(directory, 'ForegroundAlertCheck.java');
  fs.writeFileSync(file, stubs + source + checks);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const result = spawnSync('java', ['-cp', directory, 'ForegroundAlertCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
