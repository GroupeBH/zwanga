package com.zwanga.notifications;

import android.animation.ValueAnimator;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.function.Consumer;

/** Native request ticket. No map, network, RN mount or independent countdown timer. */
final class IncomingRideView extends LinearLayout {
  private static final int INK = 0xff102542, MUTED = 0xff596579, ORANGE = 0xffff6618;
  private static final int WHITE = 0xffffffff, LINE = 0xffe3e6eb, PEACH = 0xfffff0e7, BLUE = 0xff007fae;
  private final TextView timer, privacy;
  private final ProgressBar progress;
  private final LinearLayout privateDetails;
  private boolean detailsVisible;

  IncomingRideView(Context c, boolean booking, Notification card, IncomingRideContent data,
      Consumer<PendingIntent> respond, Runnable open) {
    super(c); setOrientation(VERTICAL); setBackgroundColor(WHITE);
    setPadding(dp(20), dp(20), dp(20), dp(8));
    setOnApplyWindowInsetsListener((v, insets) -> {
      if (Build.VERSION.SDK_INT >= 30) {
        android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        setPadding(dp(20) + safe.left, dp(16) + safe.top, dp(20) + safe.right, dp(8) + safe.bottom);
      } else {
        setPadding(dp(20) + insets.getSystemWindowInsetLeft(), dp(16) + insets.getSystemWindowInsetTop(),
          dp(20) + insets.getSystemWindowInsetRight(), dp(8) + insets.getSystemWindowInsetBottom());
      }
      return insets;
    });
    LinearLayout brand = row();
    ImageView logo = new ImageView(c); logo.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    logo.setImageDrawable(c.getApplicationInfo().loadIcon(c.getPackageManager()));
    brand.addView(logo, new LayoutParams(dp(24), dp(28)));
    TextView name = text("Zwanga", 16, INK, true); name.setPadding(dp(2), 0, 0, 0);
    brand.addView(name, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1));
    timer = text("", 13, 0xffb33700, true); timer.setGravity(Gravity.CENTER_VERTICAL);
    timer.setPadding(dp(10), dp(7), dp(10), dp(7)); timer.setBackground(shape(PEACH, 20, PEACH, 0));
    brand.addView(timer); addView(brand);
    progress = new ProgressBar(c, null, android.R.attr.progressBarStyleHorizontal);
    progress.setMax(1000); progress.setProgressTintList(ColorStateList.valueOf(ORANGE));
    progress.setProgressBackgroundTintList(ColorStateList.valueOf(LINE));
    progress.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    LayoutParams progressParams = new LayoutParams(LayoutParams.MATCH_PARENT, dp(4));
    progressParams.topMargin = dp(12); addView(progress, progressParams);

    ScrollView scroll = new ScrollView(c); scroll.setFillViewport(true); scroll.setVerticalScrollBarEnabled(false);
    LinearLayout content = column(); content.setPadding(0, dp(24), 0, dp(20));
    TextView eyebrow = text(booking ? "NOUVELLE RÉSERVATION" : "NOUVELLE COMMANDE", 11, 0xffb33700, true);
    eyebrow.setLetterSpacing(0.08f); content.addView(eyebrow);
    TextView heading = text(booking ? "Un passager a\nréservé" : "Un passager vous\nattend", 28, INK, true);
    heading.setPadding(0, dp(8), 0, dp(18)); heading.setLineSpacing(0, 1.06f);
    if (Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true);
    content.addView(heading);
    privateDetails = column();
    LinearLayout price = row(); price.setGravity(Gravity.BOTTOM);
    boolean largeText = getResources().getConfiguration().fontScale > 1.2f;
    TextView amount = text(data.price, data.price.length() > 13 ? 28 : 40, INK, true);
    price.addView(amount);
    TextView perSeat = text(data.priceLabel, 13, MUTED, false);
    boolean stackedPrice = largeText || amount.getPaint().measureText(data.price)
      + perSeat.getPaint().measureText(data.priceLabel) + dp(8)
      > dp(getResources().getConfiguration().screenWidthDp - 40);
    if (stackedPrice) price.setOrientation(VERTICAL);
    perSeat.setPadding(stackedPrice ? 0 : dp(8), dp(4), 0, dp(5)); price.addView(perSeat);
    privateDetails.addView(price);
    LinearLayout route = row(); route.setGravity(Gravity.TOP);
    route.setPadding(dp(14), dp(16), dp(14), dp(16)); route.setBackground(shape(PEACH, 14, PEACH, 0));
    route.addView(new RouteMark(c), new LayoutParams(dp(24), dp(92)));
    LinearLayout addresses = column(); addresses.setPadding(dp(14), 0, 0, 0);
    addresses.addView(text("Départ", 12, MUTED, false));
    TextView from = text(data.departure.isEmpty() ? "À consulter dans Zwanga" : data.departure, 17, INK, true);
    from.setPadding(0, dp(3), 0, dp(18)); addresses.addView(from);
    addresses.addView(text("Arrivée", 12, MUTED, false));
    TextView to = text(data.arrival.isEmpty() ? "À consulter dans Zwanga" : data.arrival, 17, INK, true);
    to.setPadding(0, dp(3), 0, 0); addresses.addView(to);
    route.addView(addresses, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1));
    LayoutParams routeParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    routeParams.topMargin = dp(20); privateDetails.addView(route, routeParams);
    LinearLayout chips = row(); chips.setPadding(0, dp(16), 0, 0);
    boolean compact = getResources().getConfiguration().screenWidthDp < 360;
    chips.setOrientation(largeText || compact ? VERTICAL : HORIZONTAL);
    if (!data.seats.isEmpty()) chips.addView(chip(data.seats));
    if (!data.schedule.isEmpty()) {
      LayoutParams scheduleParams = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
      if (!data.seats.isEmpty()) { if (largeText || compact) scheduleParams.topMargin = dp(8); else scheduleParams.leftMargin = dp(8); }
      chips.addView(chip(data.schedule), scheduleParams);
    }
    if (chips.getChildCount() > 0) privateDetails.addView(chips);
    if (!data.reference.isEmpty()) {
      LayoutParams refParams = new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
      refParams.topMargin = dp(8); privateDetails.addView(chip(data.reference), refParams);
    }
    if (!data.passenger.isEmpty()) {
      View line = new View(c); line.setBackgroundColor(LINE);
      LayoutParams lineParams = new LayoutParams(LayoutParams.MATCH_PARENT, dp(1)); lineParams.topMargin = dp(20);
      privateDetails.addView(line, lineParams);
      LinearLayout person = row(); person.setPadding(0, dp(14), 0, 0);
      TextView avatar = text(new String(Character.toChars(data.passenger.codePointAt(0))).toUpperCase(java.util.Locale.FRENCH), 16, WHITE, true);
      avatar.setGravity(Gravity.CENTER); avatar.setBackground(shape(INK, 24, INK, 0));
      avatar.setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
      person.addView(avatar, new LayoutParams(dp(44), dp(44)));
      LinearLayout identity = column(); identity.setPadding(dp(12), 0, 0, 0);
      identity.addView(text(data.passenger, 17, INK, true));
      TextView profile = text("Profil à consulter dans Zwanga", 13, MUTED, false); profile.setPadding(0, dp(4), 0, 0);
      identity.addView(profile); person.addView(identity, new LayoutParams(0, LayoutParams.WRAP_CONTENT, 1));
      privateDetails.addView(person);
    }
    privateDetails.setVisibility(GONE); content.addView(privateDetails);
    privacy = text("Déverrouillez pour voir le trajet et répondre dans Zwanga.", 17, MUTED, false);
    privacy.setPadding(dp(16), dp(20), dp(16), dp(20)); privacy.setLineSpacing(dp(4), 1);
    privacy.setBackground(shape(PEACH, 14, PEACH, 0)); content.addView(privacy);
    scroll.addView(content); addView(scroll, new LayoutParams(LayoutParams.MATCH_PARENT, 0, 1));
    View divider = new View(c); divider.setBackgroundColor(LINE);
    addView(divider, new LayoutParams(LayoutParams.MATCH_PARENT, dp(1)));
    LinearLayout footer = column(); footer.setPadding(0, dp(16), 0, 0);
    LinearLayout actions = row(); boolean stacked = largeText || compact;
    actions.setOrientation(stacked ? VERTICAL : HORIZONTAL);
    if (card != null && card.actions != null) for (Notification.Action action : card.actions) {
      if (action == null || action.title == null || action.actionIntent == null) continue;
      String label = action.title.toString(); boolean decline = label.toLowerCase(java.util.Locale.FRENCH).contains("refus");
      // Shared-ride review and existing PendingIntent semantics remain unchanged.
      Button button = button(label.equalsIgnoreCase("Accepter") ? "✓  Accepter la course" : label, !decline);
      button.setOnClickListener(v -> respond.accept(action.actionIntent));
      LayoutParams params = new LayoutParams(stacked ? LayoutParams.MATCH_PARENT : 0, LayoutParams.WRAP_CONTENT,
        stacked ? 0 : decline ? 1 : 1.9f);
      if (actions.getChildCount() > 0) { if (stacked) params.topMargin = dp(8); else params.leftMargin = dp(12); }
      actions.addView(button, params);
    }
    footer.addView(actions);
    Button detailsButton = button("Voir le détail dans Zwanga", false);
    detailsButton.setBackground(new RippleDrawable(ColorStateList.valueOf(0x18007fae), shape(WHITE, 24, WHITE, 0), null));
    detailsButton.setTextColor(BLUE); detailsButton.setTextSize(14); detailsButton.setOnClickListener(v -> open.run());
    LayoutParams openParams = new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    openParams.topMargin = dp(6); footer.addView(detailsButton, openParams); addView(footer);
    if (Build.VERSION.SDK_INT >= 26 && ValueAnimator.areAnimatorsEnabled()) {
      content.setAlpha(0); content.setTranslationY(dp(6));
      content.animate().alpha(1).translationY(0).setDuration(160).start();
    }
  }
  void showDetails(boolean visible) {
    if (detailsVisible == visible) return;
    detailsVisible = visible; privateDetails.setVisibility(visible ? VISIBLE : GONE); privacy.setVisibility(visible ? GONE : VISIBLE);
  }
  void updateCountdown(long remaining, long duration) {
    String label = "◷  " + IncomingRideContent.countdown(remaining);
    if (!label.contentEquals(timer.getText())) timer.setText(label);
    timer.setContentDescription("Temps restant : " + IncomingRideContent.countdown(remaining));
    progress.setProgress((int) Math.max(0, Math.min(1000, 1000 * remaining / Math.max(1, duration))));
  }
  private LinearLayout row() { LinearLayout view = new LinearLayout(getContext()); view.setOrientation(HORIZONTAL); view.setGravity(Gravity.CENTER_VERTICAL); return view; }
  private LinearLayout column() { LinearLayout view = new LinearLayout(getContext()); view.setOrientation(VERTICAL); return view; }
  private TextView text(CharSequence value, int size, int color, boolean bold) {
    TextView view = new TextView(getContext()); view.setText(value); view.setTextSize(size); view.setTextColor(color);
    view.setFontFeatureSettings("kern"); view.setIncludeFontPadding(false);
    view.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL)); return view;
  }
  private TextView chip(String value) {
    TextView view = text(value, 13, INK, false); view.setPadding(dp(12), dp(8), dp(12), dp(8));
    view.setBackground(shape(WHITE, 20, LINE, 1)); return view;
  }
  private Button button(CharSequence title, boolean primary) {
    Button view = new Button(getContext()); view.setText(title); view.setAllCaps(false); view.setTextSize(16);
    view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); view.setTextColor(INK);
    view.setMinHeight(dp(56)); view.setMinimumHeight(dp(56)); view.setMinWidth(0); view.setMinimumWidth(0);
    view.setPadding(dp(10), dp(12), dp(10), dp(12)); view.setStateListAnimator(null);
    view.setBackground(new RippleDrawable(ColorStateList.valueOf(primary ? 0x33ffffff : 0x18102542),
      shape(primary ? ORANGE : WHITE, 32, primary ? ORANGE : INK, primary ? 0 : 2), null)); return view;
  }
  private GradientDrawable shape(int fill, int radius, int border, int width) {
    GradientDrawable drawable = new GradientDrawable(); drawable.setColor(fill);
    drawable.setCornerRadius(dp(radius)); if (width > 0) drawable.setStroke(dp(width), border); return drawable;
  }
  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
  private static final class RouteMark extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path pin = new Path();
    private final DashPathEffect dash = new DashPathEffect(new float[]{4, 4}, 0);
    RouteMark(Context c) { super(c); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
      pin.moveTo(12, 92); pin.cubicTo(6, 84, 3, 81, 3, 77); pin.cubicTo(3, 65, 21, 65, 21, 77); pin.cubicTo(21, 81, 18, 84, 12, 92); }
    @Override protected void onDraw(Canvas canvas) {
      super.onDraw(canvas); canvas.save(); canvas.scale(getWidth() / 24f, getHeight() / 92f);
      paint.setColor(BLUE); paint.setStrokeWidth(1.5f); paint.setStyle(Paint.Style.STROKE);
      paint.setPathEffect(dash); canvas.drawLine(12, 20, 12, 65, paint);
      paint.setPathEffect(null); paint.setStyle(Paint.Style.FILL); paint.setColor(WHITE); canvas.drawCircle(12, 12, 9, paint);
      paint.setColor(ORANGE); canvas.drawCircle(12, 12, 6, paint); paint.setColor(BLUE); canvas.drawPath(pin, paint);
      paint.setColor(WHITE); canvas.drawCircle(12, 76, 3, paint); canvas.restore();
    }
  }
}
