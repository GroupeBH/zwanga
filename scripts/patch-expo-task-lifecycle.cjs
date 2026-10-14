const fs = require('node:fs');
const path = require('node:path');
const marker = 'ZWANGA_TASK_LIFECYCLE_V1';
const target = 'node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskService.java';

function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('[task-lifecycle] Expo source changed; review the patch.');
  return source.replace(before, after);
}

function patch(input) {
  let source = input.replace(/\r\n/g, '\n');
  if (source.includes(marker)) {
    for (const expected of ['sTaskCallbacks.remove(eventId)', 'appEvents = sEvents.get(appScopeKey);',
      'expireTaskCallback(eventId)', 'clearTaskCallbacks(appScopeKey)', 'ConcurrentHashMap', 'synchronized registration']) {
      if (!source.includes(expected)) throw new Error('[task-lifecycle] Incomplete native patch.');
    }
    return input;
  }
  source = once(source, 'TaskExecutionCallback taskCallback = sTaskCallbacks.get(eventId);',
    'sCallbackHandler.removeCallbacksAndMessages(eventId);\n    TaskExecutionCallback taskCallback = sTaskCallbacks.remove(eventId);');
  source = once(source, '    String eventId = (String) response.get("eventId");',
    '    String eventId = (String) response.get("eventId");\n    if (eventId == null) return;');
  source = once(source, `    } else {
      appEvents = new ArrayList<>();
      appEvents.add(eventId);
    }`, `    } else {
      appEvents = sEvents.get(appScopeKey);
      appEvents.add(eventId);
    }`);
  source = once(source, '      sTaskCallbacks.put(eventId, callback);', `      sTaskCallbacks.put(eventId, callback);
      expireTaskCallback(eventId);`);
  source = once(source, 'private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new HashMap<>();',
    'private static final Map<String, TaskExecutionCallback> sTaskCallbacks = new java.util.concurrent.ConcurrentHashMap<>();');
  source = once(source, '    List<String> appEvents = sEvents.get(appScopeKey);\n\n    Log.i(TAG, "Finished task',
    '    synchronized (sEvents) {\n    List<String> appEvents = sEvents.get(appScopeKey);\n\n    Log.i(TAG, "Finished task');
  source = once(source, '    // Invoke task callback', '    } // synchronized events\n\n    // Invoke task callback');
  source = once(source, '        Handler handler = new Handler();', '        Handler handler = sCallbackHandler;');
  source = once(source, '            if (!sEvents.containsKey(appScopeKey)) {\n              invalidateAppRecord(appScopeKey);\n            }',
    '            synchronized (sEvents) {\n              if (!sEvents.containsKey(appScopeKey)) invalidateAppRecord(appScopeKey);\n            }');
  source = once(source, '    if (callback != null) {\n      sTaskCallbacks.put',
    '    final List<String> appEvents;\n    synchronized (sEvents) {\n    if (callback != null) {\n      sTaskCallbacks.put');
  source = once(source, '    final List<String> appEvents;\n    if (sEvents.get', '    if (sEvents.get');
  source = once(source, '    if (taskManager != null) {\n      taskManager.executeTaskWithBody',
    '    } // synchronized registration\n\n    if (taskManager != null) {\n      taskManager.executeTaskWithBody');
  source = once(source, '          sEvents.remove(appScopeKey);', '          clearTaskCallbacks(appScopeKey);\n          sEvents.remove(appScopeKey);');
  source = once(source, '      appEvents.remove(eventId);\n      mTasksAndEventsRepository.removeEvents(appScopeKey);',
    '      clearTaskCallbacks(appScopeKey);\n      sEvents.remove(appScopeKey);\n      mTasksAndEventsRepository.removeEvents(appScopeKey);');
  source = once(source, '    Map<String, TaskInterface> appTasks = mTasksAndEventsRepository.getTasks(appScopeKey);\n\n    if (appTasks != null) {\n      Log.i(TAG, "Unregistering all tasks',
    '    clearTaskCallbacks(appScopeKey);\n    Map<String, TaskInterface> appTasks = mTasksAndEventsRepository.getTasks(appScopeKey);\n\n    if (appTasks != null) {\n      Log.i(TAG, "Unregistering all tasks');
  source = once(source, '  public TaskService(Context context) {', `  // ${marker}: completed callbacks must not retain JobService / JobParameters.
  private static final Handler sCallbackHandler = new Handler(android.os.Looper.getMainLooper());

  private void clearTaskCallbacks(String appScopeKey) {
    synchronized (sEvents) {
    List<String> events = sEvents.get(appScopeKey);
    if (events == null) return;
    for (String eventId : events) {
      sTaskCallbacks.remove(eventId);
      sCallbackHandler.removeCallbacksAndMessages(eventId);
    }
    }
  }

  private static void expireTaskCallback(String eventId) {
    // Same deadline as the existing Android job timeout. Do not invoke jobFinished twice.
    // Keep event accounting until JS finishes: timeout must not tear down a still-running JS task.
    // This captures only the event ID, never a Service, callback or Context.
    sCallbackHandler.postAtTime(() -> {
      sTaskCallbacks.remove(eventId);
      sCallbackHandler.removeCallbacksAndMessages(eventId);
    }, eventId, android.os.SystemClock.uptimeMillis() + MAX_TASK_EXECUTION_TIME_MS);
  }

  public TaskService(Context context) {`);
  return source;
}

function apply(root = process.cwd(), check = false) {
  const file = path.join(root, target), before = fs.readFileSync(file, 'utf8'), after = patch(before);
  if (check && before !== after) throw new Error('[task-lifecycle] Native patch missing. Run npm install.');
  if (!check && before !== after) fs.writeFileSync(file, after);
}
if (require.main === module) {
  apply(process.cwd(), process.argv.includes('--check'));
  console.log('[task-lifecycle] Callback cleanup and concurrent event tracking verified.');
}
module.exports = { patch, apply, target, marker };
