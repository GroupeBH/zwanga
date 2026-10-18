import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function ServiceLayout({
  title,
  children,
  footer,
  onBack,
  scrollRef,
  allowBackGesture,
  embedded = false,
  bottomOverlay = 0,
}: React.PropsWithChildren<{
  title: string;
  footer?: React.ReactNode;
  onBack?: () => void;
  scrollRef?: React.Ref<ScrollView>;
  allowBackGesture?: boolean;
  embedded?: boolean;
  bottomOverlay?: number;
}>) {
  return (
    <SafeAreaView
      style={s.screen}
      edges={embedded ? ["top", "left", "right"] : undefined}
    >
      {!embedded && (
        <Stack.Screen
          options={{
            headerShown: false,
            ...(allowBackGesture === undefined
              ? {}
              : { gestureEnabled: allowBackGesture }),
          }}
        />
      )}
      <View style={s.header}>
        {!embedded && (
          <TouchableOpacity
            accessibilityLabel="Retour"
            accessibilityRole="button"
            onPress={
              onBack ??
              (() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/(tabs)/profile"))
            }
            style={s.back}
          >
            <Ionicons name="arrow-back" size={24} color="#172D3B" />
          </TouchableOpacity>
        )}
        <Text style={s.heading}>{title}</Text>
      </View>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            s.content,
            { paddingBottom: s.content.paddingBottom + bottomOverlay },
          ]}
          scrollIndicatorInsets={{ bottom: bottomOverlay }}
        >
          {children}
        </ScrollView>
        {!!footer && <View style={s.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function ServiceButton({
  title,
  onPress,
  disabled,
  busy,
  secondary,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={disabled || busy}
      style={[
        s.button,
        secondary && s.secondary,
        (disabled || busy) && s.disabled,
      ]}
    >
      {busy && <ActivityIndicator color={secondary ? "#172D3B" : "#FFF"} />}
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
    </TouchableOpacity>
  );
}
export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFF" },
  flex: { flex: 1 },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EBEE",
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  heading: { fontSize: 20, fontWeight: "700", color: "#172D3B", flex: 1 },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "#E7EBEE",
    backgroundColor: "#FFF",
  },
  title: { fontSize: 27, fontWeight: "700", color: "#172D3B" },
  label: { fontSize: 16, fontWeight: "700", color: "#172D3B" },
  text: { color: "#556570", fontSize: 15, lineHeight: 22 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: { justifyContent: "space-between" },
  section: {
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E7EBEE",
  },
  notice: { padding: 16, gap: 6, borderRadius: 12, backgroundColor: "#F0F5F7" },
  eyebrow: {
    color: "#A84318",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  badge: { color: "#33647F", fontWeight: "600", fontSize: 13 },
  error: { color: "#B42318", lineHeight: 22 },
  button: {
    padding: 14,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#D84D16",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  secondary: { backgroundColor: "#F0F5F7" },
  secondaryText: { color: "#172D3B" },
  disabled: { opacity: 0.5 },
  input: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: "#CED8DF",
    borderRadius: 10,
    fontSize: 16,
    color: "#172D3B",
  },
  option: {
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  terms: { backgroundColor: "#F8F9FA", padding: 14, borderRadius: 10 },
});
