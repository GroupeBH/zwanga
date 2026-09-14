import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors } from "@/constants/styles";
import { getPassengerInterruptionChoice } from "@/features/trip/interruptionChoice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/selectors";
import { openInterruptionChoice } from "@/store/slices/tripsSlice";
import type { Booking } from "@/types";

export function PausedPassengerRideNotice({
  booking,
}: {
  booking: Booking | undefined;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUser)?.id;
  const choice =
    booking && getPassengerInterruptionChoice(booking, userId, true);
  if (!choice) return null;
  return (
    <View style={styles.notice}>
      <Text style={styles.title}>Trajet en pause</Text>
      <Text style={styles.copy}>
        Votre place est conservée. Si vous ne souhaitez plus attendre, vous
        pouvez terminer votre trajet ici.
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.button}
        onPress={() => dispatch(openInterruptionChoice(choice))}
      >
        <Text style={styles.link}>Voir le montant et choisir</Text>
      </TouchableOpacity>
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFF4ED",
    gap: 8,
    marginVertical: 12,
  },
  title: { color: "#25282C", fontWeight: "700", fontSize: 16 },
  copy: { color: "#626A73", fontSize: 14, lineHeight: 21 },
  button: { minHeight: 44, justifyContent: "center" },
  link: { color: Colors.primary, fontWeight: "700", fontSize: 15 },
});
