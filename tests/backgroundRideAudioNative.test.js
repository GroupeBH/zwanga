const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('native teardown removes a decided card and cannot republish it from onDestroy', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-audio-cleanup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync('native/android/notifications/RideAlertAudioService.java', 'utf8');
  const method = source.slice(source.indexOf('  private void cleanup()'), source.indexOf('  private void finishAlert()'));
  const harness = `
class Handler { void removeCallbacksAndMessages(Object unused){} }
class Player { boolean closed; void close(){closed=true;} }
public class CleanupCheck {
  static final int STOP_FOREGROUND_DETACH=2,STOP_FOREGROUND_REMOVE=1;
  static java.lang.ref.WeakReference<CleanupCheck> active=new java.lang.ref.WeakReference<>(null);
  Handler main=new Handler(); Player player=new Player(); String id="card",user="driver",identity="event",channel="ring";
  boolean foreground=true,discardCard; int generation,updates,stops,mode;
  void stopForeground(int flag){stops++;mode=flag;}
  void releaseBanner(boolean ignored){if(id!=null)updates++;}
  ${method}
  static void check(boolean ok){if(!ok)throw new AssertionError();}
  public static void main(String[] args){
    CleanupCheck a=new CleanupCheck(); active=new java.lang.ref.WeakReference<>(a); a.discardCard=true;
    Player p=a.player; a.cleanup(); a.cleanup();
    check(p.closed && a.player==null && a.id==null && a.identity==null && active.get()==null);
    check(a.updates==0 && a.stops==1 && a.mode==STOP_FOREGROUND_REMOVE);
    CleanupCheck b=new CleanupCheck(); b.cleanup(); b.cleanup();
    check(b.updates==1 && b.stops==1 && b.mode==STOP_FOREGROUND_DETACH);
  }
}`;
  const file = path.join(directory, 'CleanupCheck.java'); fs.writeFileSync(file, harness);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 }); assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'CleanupCheck'], { encoding: 'utf8', timeout: 30000 }); assert.equal(run.status, 0, run.stderr);
});

test('production Java audio player handles duck, transient/permanent focus, denied focus and stale callbacks', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-background-audio-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync('native/android/notifications/RideAlertAudioPlayer.java', 'utf8')
    .replace(/^package .*;\r?\n/m, '').replace(/^import .*;\r?\n/gm, '');
  const stubs = `import java.util.*;
class Handler {
  List<Runnable> pending=new ArrayList<>();
  void post(Runnable r){pending.add(r);} void postDelayed(Runnable r,long ms){pending.add(r);}
  void removeCallbacks(Runnable r){pending.removeIf(x->x==r);}
}
class Uri {}
class Context { static final String AUDIO_SERVICE="audio"; AudioManager audio=new AudioManager(); Object getSystemService(String key){return audio;} }
class AudioAttributes {
  static final int USAGE_NOTIFICATION=5, CONTENT_TYPE_SONIFICATION=4;
  static class Builder { Builder setUsage(int a){return this;} Builder setContentType(int a){return this;} AudioAttributes build(){return new AudioAttributes();} }
}
class AudioFocusRequest {
  interface Listener { void change(int n); } Listener listener;
  static class Builder {
    AudioFocusRequest value=new AudioFocusRequest(); Builder(int n){}
    Builder setAudioAttributes(AudioAttributes a){return this;} Builder setAcceptsDelayedFocusGain(boolean b){return this;}
    Builder setOnAudioFocusChangeListener(Listener l, Handler h){value.listener=l;return this;} AudioFocusRequest build(){return value;}
  }
}
class AudioManager {
  static final int AUDIOFOCUS_GAIN=1,AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK=3,AUDIOFOCUS_LOSS=-1,AUDIOFOCUS_LOSS_TRANSIENT=-2,AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK=-3;
  static final int AUDIOFOCUS_REQUEST_GRANTED=1,AUDIOFOCUS_REQUEST_FAILED=0,AUDIOFOCUS_REQUEST_DELAYED=2;
  int result=1, abandoned=0; boolean fail; AudioFocusRequest focus;
  int requestAudioFocus(AudioFocusRequest r){if(fail)throw new SecurityException();focus=r;return result;}
  void abandonAudioFocusRequest(AudioFocusRequest r){abandoned++;}
}
class MediaPlayer {
  interface Prepared { void ready(MediaPlayer p); } interface Error { boolean error(MediaPlayer p,int what,int extra); }
  static MediaPlayer latest; boolean playing,released; float volume; Prepared prepared; Error error;
  MediaPlayer(){latest=this;} void setAudioAttributes(AudioAttributes a){} void setDataSource(Context c,Uri u){} void setLooping(boolean b){}
  void setOnErrorListener(Error l){error=l;} void setOnPreparedListener(Prepared l){prepared=l;} void prepareAsync(){}
  boolean isPlaying(){return playing;} void pause(){playing=false;} void start(){playing=true;}
  void setVolume(float a,float b){volume=a;} void release(){playing=false;released=true;}
}
`;
  const checks = `public class BackgroundAudioCheck {
  static void check(boolean v){if(!v)throw new AssertionError();}
  public static void main(String[] args){
    Context c=new Context(); Handler h=new Handler(); int[] ends={0}; Runnable ended=()->ends[0]++;
    RideAlertAudioPlayer p=new RideAlertAudioPlayer(c,h,new Uri(),ended); MediaPlayer media=MediaPlayer.latest;
    check(p.state().equals("preparing")); media.prepared.ready(media); check(media.playing && h.pending.isEmpty());
    c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK); check(media.playing && media.volume==.25f);
    c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_GAIN); check(media.volume==1f && media.playing);
    c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT); check(!media.playing && p.state().equals("interrupted"));
    c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_GAIN); check(media.playing && ends[0]==0);
    c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_LOSS); check(ends[0]==1);
    p.close(); check(media.released && c.audio.abandoned==1 && h.pending.isEmpty());
    media.prepared.ready(media); media.error.error(media,1,1); c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_GAIN);
    check(!media.playing && ends[0]==1); p.close(); check(c.audio.abandoned==1);
    c.audio.result=AudioManager.AUDIOFOCUS_REQUEST_DELAYED;
    p=new RideAlertAudioPlayer(c,h,new Uri(),ended); media=MediaPlayer.latest; media.prepared.ready(media);
    check(!media.playing && p.state().equals("interrupted")); c.audio.focus.listener.change(AudioManager.AUDIOFOCUS_GAIN); check(media.playing); p.close();
    c.audio.result=AudioManager.AUDIOFOCUS_REQUEST_FAILED;
    p=new RideAlertAudioPlayer(c,h,new Uri(),ended); media=MediaPlayer.latest; media.prepared.ready(media); check(ends[0]==2 && !media.playing); p.close();
    c.audio.fail=true;
    p=new RideAlertAudioPlayer(c,h,new Uri(),ended); media=MediaPlayer.latest; media.prepared.ready(media); check(ends[0]==3); p.close();
    p=new RideAlertAudioPlayer(c,h,new Uri(),ended); check(h.pending.size()==1); h.pending.get(0).run(); check(ends[0]==4); p.close(); check(h.pending.isEmpty());
  }
}`;
  const file = path.join(directory, 'BackgroundAudioCheck.java'); fs.writeFileSync(file, stubs + source + checks);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 }); assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'BackgroundAudioCheck'], { encoding: 'utf8', timeout: 30000 }); assert.equal(run.status, 0, run.stderr);
});
