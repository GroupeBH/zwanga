const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('real unlock policy re-presents only a valid silent card at an unlock edge', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-unlock-banner-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync('native/android/notifications/RideUnlockBanner.java', 'utf8')
    .replace(/^package .*;\r?\n/m, '').replace(/^import .*;\r?\n/gm, '');
  const harness = `
import java.util.*;
class Build { static class VERSION { static int SDK_INT=36; } }
class SystemClock { static long now=10000; static long elapsedRealtime(){return now;} }
class Intent { static final String ACTION_SCREEN_OFF="off"; String getAction(){return ACTION_SCREEN_OFF;} }
class IntentFilter { IntentFilter(String action){} }
abstract class BroadcastReceiver { public abstract void onReceive(Context c,Intent i); }
class PackageManager { static final int PERMISSION_GRANTED=0; }
class Bundle extends HashMap<String,Object> {
  Bundle(){} Bundle(Bundle b){super(b);}
  String getString(String k){return (String)get(k);}
  Bundle getBundle(String k){return (Bundle)get(k);}
  void putBoolean(String k,boolean b){put(k,b);} void putBundle(String k,Bundle b){put(k,b);}
}
class PowerManager { boolean interactive=true; boolean isInteractive(){return interactive;} }
class KeyguardManager { boolean locked; boolean isKeyguardLocked(){return locked;} }
class Preferences { boolean enabled=true; boolean getBoolean(String k,boolean d){return enabled;} }
class Notification implements Cloneable {
  static final int FLAG_ONLY_ALERT_ONCE=8,FLAG_ONGOING_EVENT=2;
  int flags=10; Object fullScreenIntent=new Object(),actions=new Object();
  String channel="silent"; long when=1234,timeout; Bundle extras=new Bundle();
  String getChannelId(){return channel;}
  long getTimeoutAfter(){return timeout;}
  public Notification clone(){try{return (Notification)super.clone();}catch(Exception e){throw new RuntimeException(e);}}
  static class Builder {
    Notification card; static Builder recoverBuilder(Context c,Notification n){Builder b=new Builder();b.card=n.clone();return b;}
    Builder setTimeoutAfter(long time){card.timeout=time;return this;} Notification build(){return card;}
  }
}
class NotificationManager {
  boolean enabled=true,allowed=true; int updates,lastId; Notification live;
  boolean areNotificationsEnabled(){return enabled;} boolean canUseFullScreenIntent(){return allowed;}
  void notify(int id,Notification card){updates++;lastId=id;live=card;}
}
class Context {
  static final int RECEIVER_NOT_EXPORTED=4;
  static final String POWER_SERVICE="power",KEYGUARD_SERVICE="keyguard",NOTIFICATION_SERVICE="notification";
  PowerManager power=new PowerManager(); KeyguardManager keyguard=new KeyguardManager();
  NotificationManager manager=new NotificationManager(); Preferences prefs=new Preferences(); int permission;
  BroadcastReceiver receiver; int removed;
  void registerReceiver(BroadcastReceiver r,IntentFilter f,int flags){receiver=r;}
  void unregisterReceiver(BroadcastReceiver r){receiver=null;removed++;}
  Object getSystemService(String k){return k.equals(POWER_SERVICE)?power:k.equals(KEYGUARD_SERVICE)?keyguard:manager;}
  Preferences getSharedPreferences(String k,int mode){return prefs;}
  int checkSelfPermission(String k){return permission;}
}
class NativeRideDelivery {
  static final Object LOCK=new Object(); static boolean active,owner=true;
  static boolean foreground(){return active;} static boolean owns(Context c,String u){return owner;}
}
class DriverAlertModule { static boolean enabled=true; static boolean fullScreenBuildEnabled(Context c){return enabled;} }
class RidePresentationExpiry { static Notification find(Context c,String id){return c.manager.live;} }
class RideAlertAudioService {
  static final String CHANNEL="silent"; static boolean permitted=true;
  static Bundle data(Notification n){return n==null?null:n.extras.getBundle("notifee.notification").getBundle("data");}
  static String identity(Bundle b){return b.getString("notificationId")+"|"+b.getString("nativeSoundUntil");}
  static long deadline(Bundle b,long now){return Long.parseLong(b.getString("nativeSoundUntil"));}
  static String originalChannel(Notification n){return "original";}
  static boolean allowed(Context c,String channel){return permitted;}
}
${source}
public class UnlockBannerCheck {
  static Context fixture(){
    Context c=new Context(); Notification n=new Notification();
    Bundle data=new Bundle(); data.put("driverId","driver");data.put("notificationId","event");
    data.put("nativeSoundUntil",Long.toString(System.currentTimeMillis()+60000));
    Bundle options=new Bundle();options.putBoolean("onlyAlertOnce",true);options.putBoolean("ongoing",true);
    Bundle card=new Bundle();card.putBundle("data",data);card.putBundle("android",options);
    n.extras.putBundle("notifee.notification",card);c.manager.live=n;return c;
  }
  static void check(boolean value){if(!value)throw new AssertionError();}
  static String identity(Context c){return RideAlertAudioService.identity(RideAlertAudioService.data(c.manager.live));}
  static void observe(RideUnlockBanner b,Context c,String sig){
    b.check(c,"driver-booking-fixture","driver",sig);SystemClock.now+=2500;
    b.check(c,"driver-booking-fixture","driver",sig);
  }
  static void rejected(java.util.function.Consumer<Context> mutation){
    Context c=fixture();String sig=identity(c);c.power.interactive=false;
    RideUnlockBanner b=new RideUnlockBanner(c);c.power.interactive=true;mutation.accept(c);
    observe(b,c,sig);check(c.manager==null||c.manager.updates==0);
  }
  public static void main(String[] args){
    Context c=fixture();String sig=identity(c);Notification original=c.manager.live;
    RideUnlockBanner b=new RideUnlockBanner(c);observe(b,c,sig);check(c.manager.updates==0);
    c.power.interactive=false;observe(b,c,sig);c.keyguard.locked=true;c.power.interactive=true;
    observe(b,c,sig);check(c.manager.updates==0);c.keyguard.locked=false;observe(b,c,sig);
    check(c.manager.updates==1&&c.manager.lastId=="driver-booking-fixture".hashCode());
    Notification visible=c.manager.live;
    check(visible!=original&&visible.fullScreenIntent==original.fullScreenIntent&&visible.actions==original.actions);
    check(visible.when==1234&&identity(c).equals(sig)&&visible.channel.equals("silent")&&visible.timeout==0);
    check((visible.flags&8)==0&&(visible.flags&2)!=0&&(original.flags&8)!=0);
    check(Boolean.TRUE.equals(original.extras.getBundle("notifee.notification").getBundle("android").get("onlyAlertOnce")));
    check(Boolean.FALSE.equals(visible.extras.getBundle("notifee.notification").getBundle("android").get("onlyAlertOnce")));
    for(int i=0;i<120;i++)observe(b,c,sig);check(c.manager.updates==1); // no periodic repost
    c.power.interactive=false;observe(b,c,sig);c.power.interactive=true;observe(b,c,sig);
    check(c.manager.updates==2); // new physical lock/unlock, same deadline
    // A short sleep observed by the system receiver between two polls still restores once.
    c.receiver.onReceive(c,new Intent());b.check(c,"driver-booking-fixture","driver",sig);
    SystemClock.now+=2499;b.check(c,"driver-booking-fixture","driver",sig);check(c.manager.updates==2);
    SystemClock.now++;b.check(c,"driver-booking-fixture","driver",sig);check(c.manager.updates==3);
    b.close();b.close();check(c.receiver==null&&c.removed==1);
    c=fixture();c.manager.live.timeout=40000;
    RideAlertAudioService.data(c.manager.live).put("nativeSoundUntil",Long.toString(System.currentTimeMillis()+10000));
    sig=identity(c);c.power.interactive=false;b=new RideUnlockBanner(c);c.power.interactive=true;observe(b,c,sig);
    check(c.manager.updates==1&&c.manager.live.timeout>0&&c.manager.live.timeout<=10000); // no renewed timeout
    rejected(v->v.manager.live=null); // never resurrect a dismissed/decided card
    rejected(v->v.manager.live.fullScreenIntent=null); // already demoted
    rejected(v->RideAlertAudioService.data(v.manager.live).put("driverId","other"));
    rejected(v->RideAlertAudioService.data(v.manager.live).put("notificationId","replacement"));
    rejected(v->RideAlertAudioService.data(v.manager.live).put("nativeSoundUntil","0"));
    // Expired even when its signature still matches.
    c=fixture();RideAlertAudioService.data(c.manager.live).put("nativeSoundUntil","0");sig=identity(c);
    c.power.interactive=false;b=new RideUnlockBanner(c);c.power.interactive=true;observe(b,c,sig);check(c.manager.updates==0);
    rejected(v->v.manager.live.channel="original"); // never replay SystemUI sound
    rejected(v->v.prefs.enabled=false);rejected(v->v.permission=-1);
    rejected(v->v.manager.allowed=false);rejected(v->v.manager.enabled=false);
    rejected(v->v.power=null);rejected(v->v.keyguard=null);rejected(v->v.manager=null);
    Build.VERSION.SDK_INT=32;rejected(v->{});Build.VERSION.SDK_INT=36;
    DriverAlertModule.enabled=false;rejected(v->{});DriverAlertModule.enabled=true;
    NativeRideDelivery.active=true;rejected(v->{});NativeRideDelivery.active=false;
    NativeRideDelivery.owner=false;rejected(v->{});NativeRideDelivery.owner=true;
    RideAlertAudioService.permitted=false;rejected(v->{});RideAlertAudioService.permitted=true;
  }
}`;
  const file = path.join(directory, 'UnlockBannerCheck.java'); fs.writeFileSync(file, harness);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'UnlockBannerCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
});
