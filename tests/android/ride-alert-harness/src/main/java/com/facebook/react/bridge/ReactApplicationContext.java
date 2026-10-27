package com.facebook.react.bridge;
import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import com.facebook.react.common.LifecycleState;
import java.util.HashSet;
public final class ReactApplicationContext extends ContextWrapper {
    public Activity activity;
    private LifecycleState state = LifecycleState.BEFORE_RESUME;
    private final HashSet<LifecycleEventListener> listeners = new HashSet<>();
    public ReactApplicationContext(Context context) { super(context); }
    public LifecycleState getLifecycleState() { return state; }
    public Activity getCurrentActivity() { return activity; }
    public void addLifecycleEventListener(LifecycleEventListener listener) { listeners.add(listener); }
    public void removeLifecycleEventListener(LifecycleEventListener listener) { listeners.remove(listener); }
    public void resume(Activity value) { activity = value; state = LifecycleState.RESUMED; for (var l : new HashSet<>(listeners)) l.onHostResume(); }
    public void pause() { state = LifecycleState.BEFORE_RESUME; activity = null; for (var l : new HashSet<>(listeners)) l.onHostPause(); }
}
