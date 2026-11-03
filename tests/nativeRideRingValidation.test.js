const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('actual Android admission transport fails closed, bounds errors and keeps the original deadline (JVM stubs)', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-ring-validation-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const source = fs.readFileSync('native/android/notifications/RideRingValidation.java', 'utf8')
    .replace(/^package .*;\r?\n/m, '').replace(/^import (android\.|org\.json\.).*;\r?\n/gm, '')
    .replaceAll('android.os.SystemClock.elapsedRealtime()', '(System.nanoTime()/1000000)')
    .replaceAll('android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE', '2');
  const file = path.join(dir, 'RingCheck.java');
  fs.writeFileSync(file, `${source}
class Context {
  static class Info { public int flags=2; } final Info info=new Info();
  Info getApplicationInfo(){ return info; }
}
class NativeRideDelivery {
  static boolean owner=true; static final Prefs prefs=new Prefs();
  static boolean owns(Context c,String u){return owner;}
  static Prefs prefs(Context c){return prefs;}
  static class Prefs extends java.util.HashMap<String,String> {
    String getString(String k,String fallback){return getOrDefault(k,fallback);}
    Prefs edit(){return this;} Prefs putString(String k,String v){put(k,v);return this;} void apply(){}
  }
}
class RideNotificationBundle { static long date(String s){try{return java.time.Instant.parse(s).toEpochMilli();}catch(Exception e){return 0;}} }
// Minimal JSON adapter: transport/control flow are real, Android/JSON plumbing is stubbed.
class JSONObject {
  String raw="{}";
  JSONObject(){} JSONObject(String s){if(!s.startsWith("{"))throw new RuntimeException();raw=s;}
  JSONObject put(String k,String v){raw="{\\\"token\\\":\\\"test\\\"}";return this;}
  boolean optBoolean(String k,boolean fallback){return raw.equals("{\\\"allowed\\\":true}");}
  public String toString(){return raw;}
}
public class RingCheck {
  static int status=200; static String response="{\\\"allowed\\\":true}";
  static boolean loseOwner=false; static int calls=0;
  static void expect(int n,int actual){System.out.println("verdict="+actual);if(n!=actual)throw new AssertionError(n+" != "+actual);}
  public static void main(String[] args)throws Exception {
    var server=com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1",0),0);
    server.createContext("/notifications/ride-alerts/validate",exchange->{
      calls++; if(!exchange.getRequestMethod().equals("POST"))throw new AssertionError();
      if(exchange.getRequestHeaders().getFirst("Authorization")!=null)throw new AssertionError();
      exchange.getRequestBody().readAllBytes(); if(loseOwner)NativeRideDelivery.owner=false;
      byte[] bytes=response.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("Location","http://127.0.0.1:1/never-follow");
      exchange.sendResponseHeaders(status,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
    });
    server.start();
    try {
      Context c=new Context(); String base="http://127.0.0.1:"+server.getAddress().getPort();
      if(!RideRingValidation.configure(c,"driver",base))throw new AssertionError("debug loopback");
      c.info.flags=0;if(RideRingValidation.configure(c,"driver",base))throw new AssertionError("release HTTP");c.info.flags=2;
      if(RideRingValidation.configure(c,"driver","https://user:secret@example.invalid"))throw new AssertionError();
      Map<String,String> d=new java.util.HashMap<>(); d.put("type","driver_dispatch_offer");d.put("driverId","driver");
      d.put("ringUntil",java.time.Instant.now().plusSeconds(40).toString());d.put("ringValidationToken","test");
      expect(1,RideRingValidation.check(c,d));
      response="{\\\"allowed\\\":false}";expect(0,RideRingValidation.check(c,d));
      status=503;expect(-1,RideRingValidation.check(c,d));status=429;expect(-1,RideRingValidation.check(c,d));
      status=302;expect(0,RideRingValidation.check(c,d));status=200;response="invalid";expect(-1,RideRingValidation.check(c,d));
      response="x".repeat(1025);expect(-1,RideRingValidation.check(c,d));
      response="{\\\"allowed\\\":true}";loseOwner=true;expect(0,RideRingValidation.check(c,d));NativeRideDelivery.owner=true;loseOwner=false;
      int before=calls;d.remove("ringValidationToken");expect(0,RideRingValidation.check(c,d));if(calls!=before)throw new AssertionError();
      d.put("ringValidationToken","test");d.put("ringUntil",java.time.Instant.now().minusSeconds(1).toString());expect(0,RideRingValidation.check(c,d));
      if(RideRingValidation.fresh(d,Long.MAX_VALUE))throw new AssertionError("expired");
      d.put("type","new_booking");expect(1,RideRingValidation.check(c,d));
    } finally {server.stop(0);}
  }
}`.replaceAll('\\\\\\"', '\\"'));
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', dir, 'RingCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, `${run.error?.code ?? ''}\n${run.stdout}\n${run.stderr}`);
});
