package com.zwanga.notifications;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.function.Consumer;

/** Lightweight native layout: no map, network, React mount or looping animation. */
final class IncomingRideView extends LinearLayout {
  private static final int INK = 0xff1e2a4a, MUTED = 0xff596579, ORANGE = 0xffcf430d;
  private static final int PAPER = 0xfffffaf6, LINE = 0xffe3e6eb;
  final TextView summary;

  IncomingRideView(Context c, boolean booking, Notification card, Consumer<PendingIntent> respond, Runnable open) {
    super(c);
    setOrientation(VERTICAL); setBackgroundColor(PAPER);
    setPadding(dp(24), dp(24), dp(24), dp(12));
    setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        setPadding(dp(24) + safe.left, dp(16) + safe.top, dp(24) + safe.right, dp(8) + safe.bottom);
      } else {
        setPadding(dp(24) + insets.getSystemWindowInsetLeft(), dp(16) + insets.getSystemWindowInsetTop(),
          dp(24) + insets.getSystemWindowInsetRight(), dp(8) + insets.getSystemWindowInsetBottom());
      }
      return insets;
    });

    LinearLayout brand = new LinearLayout(c); brand.setGravity(Gravity.CENTER_VERTICAL);
    brand.addView(new CarMark(c), new LayoutParams(dp(52), dp(52)));
    LinearLayout names = column(); names.setPadding(dp(12), 0, 0, 0);
    names.addView(text("ZWANGA", 27, INK, true));
    names.addView(text("Une course près de vous", 13, MUTED, false));
    brand.addView(names); addView(brand);

    ScrollView scroll = new ScrollView(c); scroll.setFillViewport(true); scroll.setClipToPadding(false);
    scroll.setVerticalScrollBarEnabled(false);
    LinearLayout content = column(); content.setGravity(Gravity.CENTER_VERTICAL);
    content.setPadding(0, dp(28), 0, dp(20));
    TextView eyebrow = text(booking ? "NOUVELLE RÉSERVATION" : "NOUVELLE DEMANDE", 12, ORANGE, true);
    eyebrow.setLetterSpacing(0.07f); content.addView(eyebrow);
    TextView heading = text(booking ? "Un passager a réservé" : "Un passager vous attend", 32, INK, true);
    heading.setPadding(0, dp(10), 0, dp(12)); heading.setLineSpacing(0, 1.06f);
    if (Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
    content.addView(heading);
    TextView instruction = text("Consultez le trajet, puis choisissez votre réponse.", 16, MUTED, false);
    instruction.setLineSpacing(dp(3), 1); content.addView(instruction);

    LinearLayout details = column(); details.setPadding(dp(20), dp(20), dp(20), dp(20));
    details.setBackground(shape(0xffffffff, 22, LINE));
    TextView caption = text("LE TRAJET", 11, MUTED, true); caption.setLetterSpacing(0.08f); details.addView(caption);
    summary = text("Déverrouillez pour voir le trajet et répondre dans Zwanga.", 18, INK, false);
    summary.setPadding(0, dp(12), 0, 0); summary.setLineSpacing(dp(5), 1.12f); details.addView(summary);
    LayoutParams detailParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    detailParams.topMargin = dp(24); content.addView(details, detailParams);
    scroll.addView(content); addView(scroll, new LayoutParams(LayoutParams.MATCH_PARENT, 0, 1));

    LinearLayout footer = column();
    TextView help = text("Votre réponse sera envoyée dans Zwanga.", 13, MUTED, false);
    help.setGravity(Gravity.CENTER); help.setPadding(0, dp(8), 0, dp(14)); footer.addView(help);
    LinearLayout actions = new LinearLayout(c);
    boolean stacked = getResources().getConfiguration().fontScale > 1.2f;
    actions.setOrientation(stacked ? VERTICAL : HORIZONTAL);
    if (card != null && card.actions != null) for (int i = 0; i < card.actions.length; i++) {
      Notification.Action action = card.actions[i];
      boolean decline = action.title.toString().toLowerCase(java.util.Locale.FRENCH).contains("refus");
      Button button = button(action.title, !decline);
      button.setOnClickListener(v -> respond.accept(action.actionIntent));
      LayoutParams params = new LayoutParams(stacked ? LayoutParams.MATCH_PARENT : 0, LayoutParams.WRAP_CONTENT, stacked ? 0 : 1);
      if (i > 0) { if (stacked) params.topMargin = dp(10); else params.leftMargin = dp(12); }
      actions.addView(button, params);
    }
    footer.addView(actions);
    Button detailsButton = button("Ouvrir dans Zwanga", false);
    detailsButton.setBackground(new RippleDrawable(ColorStateList.valueOf(0x181e2a4a), shape(PAPER, 18, PAPER), null));
    detailsButton.setTextColor(INK); detailsButton.setTextSize(15);
    detailsButton.setOnClickListener(v -> open.run());
    LayoutParams openParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    openParams.topMargin = dp(8); footer.addView(detailsButton, openParams); addView(footer);
    if (Build.VERSION.SDK_INT >= 26 && ValueAnimator.areAnimatorsEnabled()) {
      content.setAlpha(0); content.setTranslationY(dp(8));
      content.animate().alpha(1).translationY(0).setDuration(180).start();
    }
  }
  private LinearLayout column() { LinearLayout view = new LinearLayout(getContext()); view.setOrientation(VERTICAL); return view; }
  private TextView text(CharSequence value, int size, int color, boolean bold) {
    TextView view = new TextView(getContext()); view.setText(value); view.setTextSize(size); view.setTextColor(color);
    view.setFontFeatureSettings("kern"); view.setIncludeFontPadding(false);
    view.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL)); return view;
  }
  private Button button(CharSequence title, boolean primary) {
    Button view = new Button(getContext()); view.setText(title); view.setAllCaps(false); view.setTextSize(17);
    view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    view.setTextColor(primary ? 0xffffffff : INK);
    view.setMinHeight(dp(58)); view.setMinimumHeight(dp(58)); view.setMinWidth(0); view.setMinimumWidth(0);
    view.setPadding(dp(14), dp(14), dp(14), dp(14));
    view.setStateListAnimator(null);
    view.setBackground(new RippleDrawable(ColorStateList.valueOf(primary ? 0x33ffffff : 0x181e2a4a),
      shape(primary ? ORANGE : 0xffffffff, 18, primary ? ORANGE : LINE), null));
    return view;
  }
  private GradientDrawable shape(int fill, int radius, int border) {
    GradientDrawable drawable = new GradientDrawable(); drawable.setColor(fill);
    drawable.setCornerRadius(dp(radius)); drawable.setStroke(dp(1), border); return drawable;
  }
  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

  private static final class CarMark extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    CarMark(Context c) { super(c); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO); }
    @Override protected void onDraw(Canvas canvas) {
      super.onDraw(canvas); canvas.save(); canvas.scale(getWidth() / 64f, getHeight() / 64f);
      paint.setStyle(Paint.Style.FILL); paint.setColor(0xffffe9dc); canvas.drawRoundRect(0, 0, 64, 64, 20, 20, paint);
      paint.setColor(ORANGE); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(2.8f); paint.setStrokeJoin(Paint.Join.ROUND);
      Path roof = new Path(); roof.moveTo(16, 28); roof.lineTo(21, 18); roof.lineTo(43, 18); roof.lineTo(48, 28); canvas.drawPath(roof, paint);
      canvas.drawRoundRect(14, 28, 50, 44, 5, 5, paint);
      paint.setStyle(Paint.Style.FILL); canvas.drawCircle(22, 35, 2.4f, paint); canvas.drawCircle(42, 35, 2.4f, paint);
      canvas.drawRoundRect(17, 43, 23, 49, 2, 2, paint); canvas.drawRoundRect(41, 43, 47, 49, 2, 2, paint); canvas.restore();
    }
  }
}
