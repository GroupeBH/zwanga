const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { patch, target, marker } = require('../scripts/patch-expo-task-lifecycle.cjs');
const source = () => fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');

test('task lifecycle patch is installed, idempotent, guarded and built from source on EAS', () => {
  const java = source(), pkg = require('../package.json');
  assert(java.includes(marker)); assert.equal(patch(java), java);
  assert.throws(() => patch('unexpected upstream'), /source changed/);
  assert.throws(() => patch(java.replaceAll('sTaskCallbacks.remove(eventId)', 'sTaskCallbacks.get(eventId)')), /Incomplete/);
  assert.match(pkg.scripts.postinstall, /patch-expo-task-lifecycle.cjs/);
  assert.match(pkg.scripts['eas-build-post-install'], /patch-expo-task-lifecycle.cjs --check/);
  assert(pkg.expo.autolinking.android.buildFromSource.includes('expo-task-manager'));
  assert.match(java, /if \(!success\) \{\s+clearTaskCallbacks\(appScopeKey\)/);
  assert.match(java, /unregisterAllTasksForAppScopeKey\(String appScopeKey\) \{\s+clearTaskCallbacks/);
});

test('actual Java lifecycle releases callbacks, tracks overlap and ignores late/duplicate completions', t => {
  if (spawnSync('javac', ['-version']).status !== 0) { t.skip('JDK required'); return; }
  const java = source();
  const helpers = java.slice(java.indexOf('  private void clearTaskCallbacks'), java.indexOf('  public TaskService(Context'));
  const completion = java.slice(java.indexOf('  public void notifyTaskFinished'), java.indexOf('  @Override\n  public void setTaskManager'));
  const registration = java.slice(java.indexOf('    final List<String> appEvents;\n    synchronized (sEvents)'), java.indexOf('    if (taskManager != null) {\n      taskManager.executeTaskWithBody'));
  assert(helpers.length > 0 && completion.length > 0 && registration.length > 0);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-task-lifecycle-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const program = `import java.util.*;
public class TaskLifecycleCheck {
  static final Map<String,List<String>> sEvents = new HashMap<>();
  static final Map<String,TaskExecutionCallback> sTaskCallbacks = new java.util.concurrent.ConcurrentHashMap<>();
  static final Handler sCallbackHandler = new Handler();
  static final int MAX_TASK_EXECUTION_TIME_MS = 15000;
  static final String TAG = "test";
  static final List<Runnable> invalidations = new java.util.concurrent.CopyOnWriteArrayList<>();
  static class Log { static void i(String a, String b) {} }
  interface TaskExecutionCallback { void onFinished(Map<String,Object> data); }
  static class Handler {
    Map<Object,Runnable> timers = new java.util.concurrent.ConcurrentHashMap<>();
    void postAtTime(Runnable r, Object token, long time) { timers.put(token,r); }
    void removeCallbacksAndMessages(Object token) { timers.remove(token); }
    void postDelayed(Runnable r, int time) { invalidations.add(r); }
  }
  int invalidated = 0;
  void invalidateAppRecord(String app) { invalidated++; }
  static class Task { String getName() { return "gps"; } }
  void register(String appScopeKey, String eventId, TaskExecutionCallback callback) {
    Task task = new Task();
${registration}
  }
${helpers.replace('android.os.SystemClock.uptimeMillis()', '0L')}
${completion}
  void complete(String app, String event) { Map<String,Object> r=new HashMap<>(); r.put("eventId",event); notifyTaskFinished("gps", app, r); }
  static void check(boolean value) { if (!value) throw new AssertionError(); }
  static void flushInvalidations() { List<Runnable> copy=new ArrayList<>(invalidations); invalidations.clear(); copy.forEach(Runnable::run); }
  public static void main(String[] args) throws Exception {
    TaskLifecycleCheck s=new TaskLifecycleCheck(); int[] calls={0};
    for (int i=0;i<10000;i++) { String id="event-"+i; s.register("app",id,r->calls[0]++); s.complete("app",id); flushInvalidations(); }
    check(calls[0]==10000 && sTaskCallbacks.isEmpty() && sEvents.isEmpty() && sCallbackHandler.timers.isEmpty());
    s.register("app","one",r->calls[0]++); s.register("app","two",r->calls[0]++);
    s.notifyTaskFinished("gps", "app", new HashMap<>());
    check(sCallbackHandler.timers.size()==2);
    check(sEvents.get("app").size()==2);
    int old=s.invalidated; s.complete("app","two"); flushInvalidations(); check(s.invalidated==old);
    check(sEvents.get("app").equals(Arrays.asList("one")));
    s.complete("app","one"); s.complete("app","one"); flushInvalidations(); check(calls[0]==10002);
    s.register("app","expired",r->{ throw new AssertionError("timeout must not finish Android job twice"); });
    sCallbackHandler.timers.get("expired").run();
    check(sEvents.get("app").contains("expired")); // Native job timeout must not abort JS.
    s.complete("app","expired");
    check(sTaskCallbacks.isEmpty() && sEvents.isEmpty() && sCallbackHandler.timers.isEmpty());
    s.register("first","a",r->{}); s.register("second","b",r->{}); s.clearTaskCallbacks("first");
    check(!sTaskCallbacks.containsKey("a") && sTaskCallbacks.containsKey("b"));
    check(!sCallbackHandler.timers.containsKey("a") && sCallbackHandler.timers.containsKey("b"));
    s.complete("first","a"); s.complete("second","b");
    s.register("app","throws",r->{throw new RuntimeException();});
    try { s.complete("app","throws"); } catch(RuntimeException expected) {}
    check(sTaskCallbacks.isEmpty() && sCallbackHandler.timers.isEmpty());
    java.util.concurrent.atomic.AtomicInteger completed = new java.util.concurrent.atomic.AtomicInteger();
    java.util.concurrent.ExecutorService workers = java.util.concurrent.Executors.newFixedThreadPool(2);
    List<java.util.concurrent.Future<?>> jobs = new ArrayList<>();
    for (int n=0;n<2;n++) { final int thread=n;
      jobs.add(workers.submit(() -> { for(int i=0;i<1000;i++) {
        String id=thread+"-"+i; s.register("concurrent",id,r->completed.incrementAndGet()); s.complete("concurrent",id);
      } })); }
    try { for (java.util.concurrent.Future<?> job:jobs) job.get(); } finally { workers.shutdown(); }
    check(completed.get()==2000 && sTaskCallbacks.isEmpty() && sEvents.isEmpty() && sCallbackHandler.timers.isEmpty());
  }
}`;
  const file = path.join(temp, 'TaskLifecycleCheck.java'); fs.writeFileSync(file, program);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const result = spawnSync('java', ['-cp', temp, 'TaskLifecycleCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
