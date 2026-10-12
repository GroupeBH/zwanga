package com.zwanga.kyc

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import com.amplifyframework.auth.AWSCredentials
import com.amplifyframework.auth.AWSCredentialsProvider
import com.amplifyframework.auth.AuthException
import com.amplifyframework.core.Consumer
import com.amplifyframework.ui.liveness.ui.FaceLivenessDetector
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import java.time.Instant

// Only in memory. No credentials in Intent extras, savedInstanceState, files or logs.
internal data class Capture(val sessionId: String, val region: String, val credentials: AWSCredentials, val promise: Promise)
internal object CaptureState {
  var capture: Capture? = null
  var activity: ZwangaAwsLivenessActivity? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { finish("cancelled") }
  fun arm() { handler.postDelayed(timeout, 180_000) }
  fun finish(result: String, error: Boolean = false) {
    val old = capture ?: return
    capture = null
    handler.removeCallbacks(timeout)
    activity?.finish()
    activity = null
    if (error) old.promise.reject("AWS_CAPTURE_FAILED", "Capture indisponible. Recommencez la vérification.")
    else old.promise.resolve(result)
  }
}

class ZwangaAwsLivenessModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "ZwangaAwsLiveness"
  @ReactMethod fun cancel() { UiThreadUtil.runOnUiThread { CaptureState.finish("cancelled") } }
  @ReactMethod fun start(input: ReadableMap, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      if (CaptureState.capture != null) { promise.reject("BUSY", "Une capture est déjà en cours."); return@runOnUiThread }
      val activity = reactApplicationContext.currentActivity
      if (activity == null) { promise.reject("NO_ACTIVITY", "Ouvrez l’application pour continuer."); return@runOnUiThread }
      try {
        val c = input.getMap("credentials") ?: throw IllegalArgumentException()
        val expiry = Instant.parse(c.getString("expiration"))
        if (expiry.isBefore(Instant.now()) || Instant.parse(input.getString("expiresAt")).isBefore(Instant.now())) throw IllegalArgumentException()
        val credentials = AWSCredentials.createAWSCredentials(c.getString("accessKeyId"), c.getString("secretAccessKey"), c.getString("sessionToken"), expiry.epochSecond)
          ?: throw IllegalArgumentException()
        CaptureState.capture = Capture(input.getString("sessionId")!!, input.getString("region")!!, credentials, promise)
        CaptureState.arm()
        activity.startActivity(Intent(activity, ZwangaAwsLivenessActivity::class.java))
      } catch (_: Exception) {
        if (CaptureState.capture != null) CaptureState.finish("cancelled", true)
        else promise.reject("INVALID_SESSION", "Session expirée. Recommencez la vérification.")
      }
    }
  }
  override fun invalidate() {
    UiThreadUtil.runOnUiThread { CaptureState.finish("cancelled") }
    super.invalidate()
  }
}

class ZwangaAwsLivenessPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ZwangaAwsLivenessModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class ZwangaAwsLivenessActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    val capture = CaptureState.capture
    if (capture == null) { finish(); return }
    CaptureState.activity = this
    val provider = object : AWSCredentialsProvider<AWSCredentials> {
      override fun fetchAWSCredentials(onSuccess: Consumer<AWSCredentials>, onError: Consumer<AuthException>) {
        onSuccess.accept(capture.credentials)
      }
    }
    setContent {
      MaterialTheme {
        BackHandler { CaptureState.finish("cancelled") }
        FaceLivenessDetector(sessionId = capture.sessionId, region = capture.region, credentialsProvider = provider,
          onComplete = { CaptureState.finish("completed") },
          onError = { CaptureState.finish("cancelled", true) })
      }
    }
  }
  override fun onStop() {
    super.onStop()
    if (!isChangingConfigurations) CaptureState.finish("cancelled")
  }
  override fun onDestroy() {
    if (isFinishing) CaptureState.finish("cancelled")
    if (CaptureState.activity === this) CaptureState.activity = null
    super.onDestroy()
  }
}
