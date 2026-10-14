package com.zwanga.images;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.*;
import com.facebook.react.uimanager.ViewManager;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Local files only. No full-resolution bitmap, network access or extra dependency. */
public final class BoundedImagePackage implements ReactPackage {
  @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {
    return Collections.singletonList(new BoundedImageModule(context));
  }
  @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {
    return Collections.emptyList();
  }

  public static final class BoundedImageModule extends ReactContextBaseJavaModule {
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    BoundedImageModule(ReactApplicationContext context) { super(context); }
    @Override public String getName() { return "ZwangaBoundedImage"; }
    @Override public void invalidate() { worker.shutdown(); super.invalidate(); }

    @ReactMethod public void prepare(String value, double edge, double quality, Promise promise) {
      if (!BUSY.compareAndSet(false, true)) {
        promise.reject("IMAGE_BUSY", "Une photo est déjà en cours de préparation."); return;
      }
      try {
        worker.execute(() -> {
          try { promise.resolve(prepareFile(value, edge, quality)); }
          catch (OutOfMemoryError error) {
            promise.reject("IMAGE_MEMORY", "Mémoire insuffisante. Fermez les autres applications puis réessayez.");
          } catch (Exception error) {
            // Do not send local paths, metadata or the original exception to telemetry.
            promise.reject("IMAGE_PREPARE", "Cette photo ne peut pas être préparée. Choisissez une autre photo.");
          } finally { BUSY.set(false); }
        });
      } catch (RejectedExecutionException error) {
        BUSY.set(false); promise.reject("IMAGE_CLOSED", "Veuillez rouvrir la sélection de photo.");
      }
    }

    private InputStream open(Uri uri) throws IOException {
      InputStream stream = getReactApplicationContext().getContentResolver().openInputStream(uri);
      if (stream == null) throw new IOException("Unreadable image");
      return stream;
    }

    private String prepareFile(String value, double edge, double quality) throws IOException {
      Uri uri = Uri.parse(value);
      if (!("file".equals(uri.getScheme()) || "content".equals(uri.getScheme())) ||
          !Double.isFinite(edge) || edge < 1 || edge > 2048 ||
          !Double.isFinite(quality) || quality < 0 || quality > 1) throw new IOException("Invalid input");
      BitmapFactory.Options options = new BitmapFactory.Options();
      options.inJustDecodeBounds = true;
      try (InputStream stream = open(uri)) { BitmapFactory.decodeStream(stream, null, options); }
      options.inSampleSize = sampleSize(options.outWidth, options.outHeight);
      options.inJustDecodeBounds = false;
      options.inPreferredConfig = Bitmap.Config.ARGB_8888;
      int orientation = ExifInterface.ORIENTATION_NORMAL;
      try (InputStream stream = open(uri)) {
        orientation = new ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, orientation);
      } catch (IOException ignored) { /* Images without supported EXIF keep their pixel orientation. */ }
      Bitmap decoded = null, output = null;
      File file = null;
      boolean saved = false;
      try {
        try (InputStream stream = open(uri)) { decoded = BitmapFactory.decodeStream(stream, null, options); }
        if (decoded == null) throw new IOException("Unsupported image");
        float ratio = Math.min(1f, (float) edge / Math.max(decoded.getWidth(), decoded.getHeight()));
        Matrix matrix = orientationMatrix(orientation);
        matrix.postScale(ratio, ratio);
        output = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
        file = File.createTempFile("zwanga-prepared-", ".jpg", getReactApplicationContext().getCacheDir());
        try (OutputStream stream = new FileOutputStream(file)) {
          if (!output.compress(Bitmap.CompressFormat.JPEG, (int) Math.round(quality * 100), stream))
            throw new IOException("JPEG export failed");
        }
        saved = true;
        return Uri.fromFile(file).toString();
      } finally {
        if (output != null && output != decoded) output.recycle();
        if (decoded != null) decoded.recycle();
        if (!saved && file != null) file.delete();
      }
    }

    // Bounds are read without a bitmap; the decoder allocates <= 2048 pixels per edge.
    public static int sampleSize(int width, int height) throws IOException {
      if (width <= 0 || height <= 0) throw new IOException("Invalid dimensions");
      int sample = 1;
      while (((long) Math.max(width, height) + sample - 1) / sample > 2048) sample *= 2;
      return sample;
    }

    private static Matrix orientationMatrix(int orientation) {
      Matrix matrix = new Matrix();
      switch (orientation) {
        case 2: matrix.setScale(-1, 1); break;
        case 3: matrix.setRotate(180); break;
        case 4: matrix.setScale(1, -1); break;
        case 5: matrix.setRotate(90); matrix.postScale(-1, 1); break;
        case 6: matrix.setRotate(90); break;
        case 7: matrix.setRotate(-90); matrix.postScale(-1, 1); break;
        case 8: matrix.setRotate(-90); break;
        default: break;
      }
      return matrix;
    }
  }
}
