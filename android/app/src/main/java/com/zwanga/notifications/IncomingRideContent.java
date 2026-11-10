package com.zwanga.notifications;

import java.text.NumberFormat;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** Bounded presentation only: no network, inferred fares or invented passenger statistics. */
final class IncomingRideContent {
  final String price, priceLabel, departure, arrival, seats, schedule, reference, passenger;
  IncomingRideContent(Map<String, String> data) {
    String kind = data.get("ridePriceKind");
    Double total = displayedPrice(data);
    boolean booking = "new_booking".equals(data.get("type"));
    price = total != null ? (total == 0 ? "Gratuit" :
      NumberFormat.getNumberInstance(Locale.FRANCE).format(total) + " FC") : "Prix à consulter";
    priceLabel = total != null ? (booking ? ("budget".equals(kind) ? "Budget par place" : "par place") :
      ("budget".equals(kind) ? "Budget du trajet" : "pour le trajet")) : "dans Zwanga";
    departure = label(data.get("rideDeparture"), 160); arrival = label(data.get("rideArrival"), 160);
    String count = data.get("rideSeats");
    seats = count != null && count.matches("[1-9][0-9]?") ? count + ("1".equals(count) ? " place" : " places") : "";
    schedule = schedule(data.get("rideDepartureAt"));
    String id = data.get("bookingId"); if (id == null) id = data.get("tripRequestId");
    reference = id != null && id.matches("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
      ? "Réf. " + id.substring(0, 8).toUpperCase(Locale.ROOT) : "";
    passenger = label(data.get("passengerName"), 80);
  }
  /** Unit payload remains unchanged; missing seats must not become a guessed total. */
  static Double displayedPrice(Map<String, String> data) {
    String price = data.get("ridePricePerSeat"), kind = data.get("ridePriceKind");
    if (price == null || !price.matches("[0-9]{1,10}(\\.[0-9]{1,2})?") ||
        (!"fare".equals(kind) && !"budget".equals(kind))) return null;
    double amount = Double.parseDouble(price);
    if ("new_booking".equals(data.get("type"))) return amount;
    String seats = data.get("rideSeats");
    return seats != null && seats.matches("[1-9][0-9]?") ? amount * Integer.parseInt(seats) : null;
  }
  static String label(String value, int limit) {
    if (value == null) return "";
    String clean = value.substring(0, Math.min(value.length(), 1600)).replaceAll("<[^>]*>", " ")
      .replaceAll("[\\p{Cntrl}\\p{Cf}]", " ").replaceAll("\\s+", " ").trim();
    if (clean.length() <= limit) return clean;
    int end = Character.isHighSurrogate(clean.charAt(limit - 1)) ? limit - 1 : limit;
    return clean.substring(0, end) + "…";
  }
  private static String schedule(String raw) {
    if (raw == null || !raw.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z")) return "";
    SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US);
    parser.setLenient(false); ParsePosition cursor = new ParsePosition(0); Date date = parser.parse(raw, cursor);
    if (date == null || cursor.getIndex() != raw.length()) return "";
    SimpleDateFormat display = new SimpleDateFormat("EEE d MMM · HH:mm", Locale.FRANCE);
    display.setTimeZone(TimeZone.getTimeZone("Africa/Kinshasa")); return display.format(date);
  }
  static String countdown(long remainingMs) {
    long seconds = (Math.max(0, Math.min(60_000, remainingMs)) + 999) / 1000;
    return String.format(Locale.ROOT, "%d:%02d", seconds / 60, seconds % 60);
  }
}
