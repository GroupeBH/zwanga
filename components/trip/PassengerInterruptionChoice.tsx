import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "@/constants/styles";
import {
  useDecideDriverInterruptionMutation,
  useGetDriverInterruptionFareQuery,
} from "@/store/api/tripApi";
import { isMatchingInterruptionQuote } from "@/features/trip/interruptionChoice";
import { getApiErrorMessage } from "@/utils/errorHelpers";

type Props = {
  tripId: string;
  bookingId: string;
  requestId: string;
  onResolved: () => void;
};
const numbers = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const money = (amount: number) => `${numbers.format(amount)} FC`;

/** Content of the shared ride/payment modal: no stacked native modals on iOS. */
export function PassengerInterruptionChoice({
  tripId,
  bookingId,
  requestId,
  onResolved,
}: Props) {
  const {
    currentData: quote,
    isFetching,
    isError,
    refetch,
  } = useGetDriverInterruptionFareQuery(
    { tripId, bookingId, requestId },
    { refetchOnMountOrArgChange: true },
  );
  const [decide, { isLoading }] = useDecideDriverInterruptionMutation();
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const hasQuote =
    isMatchingInterruptionQuote(quote, bookingId, requestId) &&
    !isFetching &&
    !isError;
  const choose = async (decision: "wait" | "stop") => {
    if (inFlight.current || (decision === "stop" && !hasQuote)) return;
    inFlight.current = true;
    setError("");
    try {
      await decide({
        tripId,
        bookingId,
        requestId,
        decision,
        ...(decision === "stop" ? { quoteId: quote!.id } : {}),
      }).unwrap();
      onResolved();
    } catch (failure) {
      setError(
        getApiErrorMessage(
          failure,
          "Votre choix n'a pas pu être confirmé. Vérifiez votre connexion et réessayez.",
        ),
      );
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <>
      <ScrollView bounces={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.icon}>
            <Ionicons name="pause" size={26} color={Colors.primary} />
          </View>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>INTERRUPTION CONFIRMÉE</Text>
            <Text style={styles.title}>Votre trajet est en pause</Text>
          </View>
        </View>
        <Text style={styles.description}>
          Vous pouvez garder votre place et attendre le redémarrage, ou terminer
          votre trajet ici.
        </Text>
        <View style={styles.fare}>
          <Text style={styles.label}>Si vous vous arrêtez ici</Text>
          {hasQuote && quote ? (
            <>
              <Text style={styles.amount}>{money(quote.passengerAmount)}</Text>
              <Text style={styles.distance}>
                {numbers.format(quote.travelledDistanceMeters / 1000)} km sur{" "}
                {numbers.format(quote.plannedDistanceMeters / 1000)} km ·{" "}
                {numbers.format(quote.travelledPercentage)} %
              </Text>
              <Text style={styles.detail}>
                Distance parcourue estimée · Prix initial :{" "}
                {money(quote.originalPassengerAmount)}
              </Text>
              <Text style={styles.detail}>
                {quote.originalPassengerAmount === 0
                  ? "Votre trajet reste gratuit."
                  : quote.minimumApplied
                    ? `Minimum appliqué : ${money(quote.minimumAmount)}, sans dépasser votre prix initial.`
                    : "Montant calculé au prorata de votre trajet."}
              </Text>
              {quote.prepaidAmount > 0 && (
                <Text style={styles.detail}>
                  Déjà réglé : {money(quote.prepaidAmount)}. La différence sera
                  créditée en jetons.
                </Text>
              )}
            </>
          ) : isFetching ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.detail}>Calcul du montant…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.description}>
                Le montant est indisponible pour le moment. Vous pouvez toujours
                choisir d’attendre.
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={refetch}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Réessayer le calcul</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        )}
      </ScrollView>
      <View style={styles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isLoading}
          onPress={() => void choose("wait")}
          style={[styles.wait, isLoading && styles.disabled]}
        >
          <Ionicons name="time-outline" size={22} color="white" />
          <Text style={styles.waitText}>Attendre le redémarrage</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading || !hasQuote }}
          disabled={isLoading || !hasQuote}
          onPress={() => void choose("stop")}
          style={[styles.stop, (isLoading || !hasQuote) && styles.disabled]}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Ionicons name="exit-outline" size={22} color={Colors.primary} />
          )}
          <Text style={styles.stopText}>
            {hasQuote && quote?.passengerAmount === 0
              ? "M’arrêter ici gratuitement"
              : "M’arrêter ici et payer"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>
          Attendre ne déclenche aucun paiement.
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, paddingBottom: 18 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFF1E9",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    color: "#767B83",
    fontWeight: "700",
    marginBottom: 4,
  },
  title: { fontSize: 23, fontWeight: "700", color: "#202428" },
  description: { color: "#626A73", fontSize: 15, lineHeight: 22 },
  fare: { borderRadius: 20, padding: 20, backgroundColor: "#F6F7F9", gap: 9 },
  label: { fontSize: 14, color: "#626A73" },
  amount: { fontSize: 34, fontWeight: "800", color: "#202428" },
  distance: { fontSize: 16, fontWeight: "600", color: "#202428" },
  detail: { fontSize: 13, lineHeight: 19, color: "#626A73" },
  loading: { flexDirection: "row", gap: 10, paddingVertical: 20 },
  retry: { minHeight: 44, justifyContent: "center" },
  retryText: { color: Colors.primary, fontWeight: "700" },
  error: { color: "#A62A32", fontSize: 14, lineHeight: 21 },
  actions: { gap: 10, paddingBottom: 8 },
  wait: {
    minHeight: 54,
    padding: 14,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  waitText: { color: "white", fontWeight: "700", fontSize: 16, flexShrink: 1 },
  stop: {
    minHeight: 54,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FFD6C3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stopText: {
    color: Colors.primary,
    fontWeight: "700",
    fontSize: 16,
    flexShrink: 1,
  },
  disabled: { opacity: 0.5 },
  footnote: {
    textAlign: "center",
    color: "#626A73",
    fontSize: 12,
    marginTop: 2,
  },
});
