package com.facebook.react.bridge;
import android.app.Activity;
public abstract class ReactContextBaseJavaModule {
    private final ReactApplicationContext context;
    protected ReactContextBaseJavaModule(ReactApplicationContext value) { context = value; }
    protected ReactApplicationContext getReactApplicationContext() { return context; }
    protected Activity getCurrentActivity() { return context.activity; }
    public abstract String getName();
    public void invalidate() { }
}
