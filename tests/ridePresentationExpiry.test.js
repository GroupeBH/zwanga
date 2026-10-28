const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('actual native demotion preserves actions, stays silent and ignores stale or removed cards', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const source = fs.readFileSync('native/android/notifications/RidePresentationExpiry.java', 'utf8');
  const signature = source.slice(source.indexOf('  private static String signature'), source.indexOf('  static boolean schedulePublished'));
  const demote = source.slice(source.indexOf('  static void demote'), source.indexOf('  static void releaseNow'));
  assert.ok(signature.includes('nativeSoundUntil') && demote.includes('Notification quiet = live.clone()'));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-banner-expiry-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const harness = `
import java.util.*;
class Bundle extends HashMap<String,Object> {
  Bundle() {} Bundle(Bundle other) { super(other); }
  String getString(String k) { return (String)get(k); }
  String getString(String k, String d) { return containsKey(k) ? getString(k) : d; }
  Bundle getBundle(String k) { return (Bundle)get(k); }
  void putBundle(String k, Bundle b) { put(k,b); }
  void putBoolean(String k, boolean b) { put(k,b); }
}
class Data extends Bundle {
  long getLong(String k, long d) { return containsKey(k) ? (Long)get(k) : d; }
  boolean getBoolean(String k, boolean d) { return containsKey(k) ? (Boolean)get(k) : d; }
}
class Notification implements Cloneable {
  static final int FLAG_ONLY_ALERT_ONCE=8, FLAG_INSISTENT=4, FLAG_ONGOING_EVENT=2;
  int flags=FLAG_INSISTENT; Object fullScreenIntent=new Object(), actions=new Object(); Bundle extras=new Bundle();
  public Notification clone() { try { return (Notification)super.clone(); } catch(Exception e) { throw new RuntimeException(e); } }
}
class NotificationManager {
  int updates, lastId; Notification live;
  void notify(int id, Notification card) { updates++; lastId=id; live=card; }
}
class Context {
  static final String NOTIFICATION_SERVICE="notification";
  final NotificationManager manager=new NotificationManager();
  Object getSystemService(String key) { return manager; }
}
class NativeRideDelivery {
  static final Object LOCK=new Object();
}
public class ExpiryCheck {
  static Notification find(Context c, String id) { return c.manager.live; }
  ${signature}
  ${demote}
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  static Data input(long deadline) {
    Data d=new Data(); d.put("card","driver-booking-local"); d.put("user","test-driver");
    d.put("signature","invitation|sound-end"); d.put("deadline",deadline); return d;
  }
  static Context fixture() {
    Context c=new Context(); Notification n=new Notification();
    Bundle data=new Bundle(); data.put("driverId","test-driver"); data.put("notificationId","invitation"); data.put("nativeSoundUntil","sound-end");
    Bundle android=new Bundle(); android.put("fullScreenAction",new Bundle()); android.putBoolean("loopSound",true);
    Bundle card=new Bundle(); card.putBundle("data",data); card.putBundle("android",android);
    n.extras.putBundle("notifee.notification",card); c.manager.live=n; return c;
  }
  public static void main(String[] args) {
    Context c=fixture(); Notification before=c.manager.live;
    demote(c,input(System.currentTimeMillis()+60000)); check(c.manager.updates==0);
    demote(c,input(0)); check(c.manager.updates==1);
    Notification quiet=c.manager.live;
    check(quiet.fullScreenIntent==null && quiet.actions==before.actions);
    check((quiet.flags & Notification.FLAG_ONLY_ALERT_ONCE)!=0 && (quiet.flags & Notification.FLAG_INSISTENT)==0);
    check(c.manager.lastId=="driver-booking-local".hashCode());
    Bundle options=quiet.extras.getBundle("notifee.notification").getBundle("android");
    check(!options.containsKey("fullScreenAction") && Boolean.FALSE.equals(options.get("loopSound")));
    check(before.fullScreenIntent!=null && before.extras.getBundle("notifee.notification").getBundle("android").containsKey("fullScreenAction"));
    demote(c,input(0)); check(c.manager.updates==1);
    c=fixture(); c.manager.live.fullScreenIntent=null; c.manager.live.flags |= Notification.FLAG_ONGOING_EVENT;
    Data release=input(0); release.putBoolean("releaseAudio",true); demote(c,release);
    check(c.manager.updates==1 && (c.manager.live.flags & Notification.FLAG_ONGOING_EVENT)==0);
    check(Boolean.FALSE.equals(c.manager.live.extras.getBundle("notifee.notification").getBundle("android").get("ongoing")));
    c=fixture(); c.manager.live=null; demote(c,input(0)); check(c.manager.updates==0 && c.manager.live==null);
    // Cleanup also works when the native FCM account is not bound (legacy JS path).
    c=fixture(); demote(c,input(0)); check(c.manager.updates==1);
    c=fixture(); Data other=input(0); other.put("user","other-driver"); demote(c,other); check(c.manager.updates==0);
    for(String key: new String[]{"driverId","notificationId","nativeSoundUntil"}) {
      c=fixture(); c.manager.live.extras.getBundle("notifee.notification").getBundle("data").put(key,"replacement");
      demote(c,input(0)); check(c.manager.updates==0);
    }
    c=fixture(); c.manager.live.extras=null; demote(c,input(0)); check(c.manager.updates==0);
    c=fixture(); Data missing=input(0); missing.remove("deadline"); demote(c,missing); check(c.manager.updates==0);
  }
}`;
  const file = path.join(directory, 'ExpiryCheck.java'); fs.writeFileSync(file, harness);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', '-d', directory, file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'ExpiryCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
});
