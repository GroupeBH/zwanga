const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('actual Java foreground player confines audio to its worker, expires leases and rejects stale lifecycle callbacks', t => {
  if (spawnSync('javac', ['-version'], { encoding: 'utf8' }).status !== 0) return t.skip('JDK required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-foreground-java-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  // Compile the complete production class, not a copy of its watchdog logic.
  // Android/RN stand-ins test scheduling and ownership, NOT device audio/lifecycle.
  const source = fs.readFileSync('native/android/notifications/ForegroundAlertPlayer.java', 'utf8')
    .replace(/^package .*;\r?\n/m, '').replace(/^import .*;\r?\n/gm, '');
  const stubs = `import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
interface Promise { void resolve(Object value); }
interface LifecycleEventListener { void onHostResume(); void onHostPause(); void onHostDestroy(); }
enum LifecycleState { RESUMED, BEFORE_RESUME }
class Looper {
  static final Looper MAIN=new Looper(); static Looper current=MAIN;
  static Looper getMainLooper() { return MAIN; }
}
class HandlerThread {
  static int starts,quits; final Looper looper=new Looper(); boolean running;
  HandlerThread(String name) {} void start(){running=true;starts++;}
  Looper getLooper(){return looper;} boolean quitSafely(){if(running){running=false;quits++;}return true;}
}
class Handler {
  static long now; static boolean holdMain; final Looper looper;
  static class Entry { Runnable run; long at; Handler handler; Entry(Runnable r,long a,Handler h) { run=r;at=a;handler=h; } }
  static List<Entry> events = new ArrayList<>();
  Handler(Looper l) {looper=l;}
  boolean post(Runnable r) { return postDelayed(r,0); }
  boolean postDelayed(Runnable r,long ms) { events.add(new Entry(r,now+ms,this));return true; }
  void removeCallbacks(Runnable r) { events.removeIf(e -> e.handler==this && e.run == r); }
  void removeCallbacksAndMessages(Object token){events.removeIf(e->e.handler==this);}
  static void advance(long ms) {
    long end=now+ms;
    while (true) {
      Entry next=events.stream().filter(e->e.at<=end&&(!holdMain||e.handler.looper!=Looper.MAIN)).min(Comparator.comparingLong(e->e.at)).orElse(null);
      if(next==null) break; events.remove(next); now=Math.max(now,next.at);
      Looper old=Looper.current; Looper.current=next.handler.looper;
      try {next.run.run();} finally {Looper.current=old;}
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
  Object getSystemService(String name) {
    if(Looper.current==Looper.MAIN)throw new AssertionError("policy/Binder work on UI thread");
    return name.equals(NOTIFICATION_SERVICE)?manager:name.equals(AUDIO_SERVICE)?audio:vibrator;
  }
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
class RideAlertAudioService { static int handoffs; static void handoff() {
  if(Looper.current!=Looper.MAIN)throw new AssertionError("service handoff must stay on UI thread"); handoffs++;
} }
class MediaPlayer {
  interface OnErrorListener { boolean onError(MediaPlayer p,int what,int extra); }
  interface OnPreparedListener { void onPrepared(MediaPlayer p); }
  static MediaPlayer latest; static boolean stall,failStart,failSource; boolean playing, released;
  OnPreparedListener prepared; OnErrorListener error; final Looper owner=Looper.current;
  void worker(){if(Looper.current==Looper.MAIN||Looper.current!=owner)throw new AssertionError("MediaPlayer outside owning audio looper");}
  MediaPlayer(){worker();latest=this;} void setAudioAttributes(AudioAttributes a){worker();}
  void setDataSource(Context c,Uri u){worker();if(failSource)throw new IllegalStateException();}
  void setLooping(boolean b){worker();} void setOnErrorListener(OnErrorListener l){worker();error=l;}
  void setOnPreparedListener(OnPreparedListener l){worker();prepared=l;}
  void prepareAsync(){worker();if(!stall)prepared.onPrepared(this);} boolean isPlaying(){worker();return playing;}
  void start(){worker();if(released || failStart)throw new IllegalStateException();playing=true;}
  void pause(){worker();playing=false;} void release(){worker();released=true;playing=false;}
  void preparedLater(){new Handler(owner).post(()->prepared.onPrepared(this));Handler.advance(0);}
  void errorLater(){new Handler(owner).post(()->error.onError(this,1,1));Handler.advance(0);}
}
`;
  const checks = `public class ForegroundAlertCheck {
  static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);}
  static void state(ForegroundAlertPlayer p,String token,String expected){
    int[] calls={0};p.state(token,value->{calls[0]++;check(expected.equals(value),"state: "+value);});Handler.advance(0);
    check(calls[0]==1,"state must settle exactly once");
  }
  static void start(ForegroundAlertPlayer p,String token,boolean paused,boolean expected){
    int[] calls={0};p.start(token,"ring",paused,value->{calls[0]++;check(Boolean.valueOf(expected).equals(value),"start result");});Handler.advance(0);
    check(calls[0]==1,"start must settle exactly once");
  }
  public static void main(String[] args){
    ReactApplicationContext context=new ReactApplicationContext(); ForegroundAlertPlayer p=new ForegroundAlertPlayer(context);
    state(p,"none","stopped");p.stop("none");p.pause("none",true);p.onHostPause();p.onHostResume();
    check(HandlerThread.starts==0,"no worker before the first start");
    p.start("one","ring",false,value->check(Boolean.TRUE.equals(value),"ready"));
    check(MediaPlayer.latest==null,"start must return before touching audio");Handler.advance(0); MediaPlayer first=MediaPlayer.latest;
    check(RideAlertAudioService.handoffs==1,"handoff after player starts");
    Handler.advance(14999); check(first.playing,"must keep playing during valid lease");
    Handler.advance(1); check(first.released&&!context.vibrator.active,"native watchdog stops sound AND vibration without JS");
    state(p,"one","stopped"); check(Handler.events.isEmpty(),"no retained watchdog after release");
    start(p,"two",false,true); MediaPlayer second=MediaPlayer.latest;
    Handler.advance(10000); state(p,"two","playing"); Handler.advance(10000); check(second.playing,"health check renews lease");
    state(p,"old","stopped"); Handler.advance(5000); check(second.released,"foreign token must not renew");
    start(p,"three",true,true); MediaPlayer third=MediaPlayer.latest;
    Handler.advance(10000); state(p,"three","paused"); Handler.advance(10000); check(!third.released,"speech pause stays healthy");
    p.stop("two");Handler.advance(0); check(!third.released,"old stop cannot stop newer player");
    p.pause("three",false);Handler.advance(0);check(third.playing,"resume after speech pause");
    p.onHostPause(); check(!third.released,"UI lifecycle callback must not release audio inline");Handler.advance(0);
    check(third.released&&Handler.events.isEmpty(),"background releases watchdog and player");
    start(p,"background",false,false);p.onHostResume();
    MediaPlayer.stall=true; p.start("stalled","ring",false,value->check(Boolean.FALSE.equals(value),"prepare timeout")); Handler.advance(0);MediaPlayer stalled=MediaPlayer.latest;
    Handler.advance(5000); check(stalled.released,"prepare still has its separate timeout");
    MediaPlayer.stall=false; start(p,"new",false,true); MediaPlayer fresh=MediaPlayer.latest;
    stalled.preparedLater(); check(fresh.playing,"late preparation cannot revive stale sound");
    context.manager.enabled=false; state(p,"new","stopped"); check(fresh.released,"permission changes still stop audio");
    context.manager.enabled=true; MediaPlayer.failStart=true;
    int handoffs=RideAlertAudioService.handoffs;
    start(p,"fails",false,false);
    check(RideAlertAudioService.handoffs==handoffs,"failed app player must not stop service audio");
    check(Handler.events.isEmpty(),"failed start clears timers");
    MediaPlayer.failStart=false;MediaPlayer.failSource=true;start(p,"bad-source",false,false);
    check(MediaPlayer.latest.released,"data source failure releases player");MediaPlayer.failSource=false;
    start(p,"errors",false,true);MediaPlayer.latest.errorLater();state(p,"errors","stopped");
    p.start("stale","ring",false,value->check(Boolean.FALSE.equals(value),"queued before lifecycle change"));
    p.onHostPause();p.onHostResume();Handler.advance(0);state(p,"stale","stopped");
    Handler.holdMain=true;start(p,"late-handoff",false,true);handoffs=RideAlertAudioService.handoffs;
    p.onHostPause();p.onHostResume();Handler.advance(0);Handler.holdMain=false;Handler.advance(0);
    check(RideAlertAudioService.handoffs==handoffs,"stale handoff cannot stop a newer background service");
    start(p,"activity-destroy",false,true);p.onHostDestroy();Handler.advance(0);
    state(p,"activity-destroy","stopped");p.onHostResume();start(p,"recreated-activity",false,true);
    check(HandlerThread.quits==0,"activity recreation does not invalidate the surviving React module");
    start(p,"last",false,true);p.destroy();p.destroy();Handler.advance(0);
    check(Handler.events.isEmpty(),"destroy clears timers");
    check(HandlerThread.starts==1&&HandlerThread.quits==1,"one lazy worker, shut down once");
    p.onHostResume();start(p,"after-destroy",false,false);state(p,"after-destroy","stopped");
    check(HandlerThread.starts==1,"destroyed player never recreates a worker");
  }
}`;
  const file = path.join(directory, 'ForegroundAlertCheck.java');
  fs.writeFileSync(file, stubs + source + checks);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const result = spawnSync('java', ['-cp', directory, 'ForegroundAlertCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
