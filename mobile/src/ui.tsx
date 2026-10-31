import React, { createContext, useContext } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
export const colors = {
  bg: "#F7F4EE",
  paper: "#FFFEFA",
  ink: "#252D26",
  green: "#254C39",
  muted: "#626A61",
  line: "#DDDCD2",
  sage: "#E7ECDf",
  clay: "#9E5134",
};
export const LangContext = createContext<"en" | "zh-TW">("en");
export function useT() {
  const l = useContext(LangContext);
  return (en: string, zh: string) => (l === "zh-TW" ? zh : en);
}
export function Label({ children }: React.PropsWithChildren) {
  return <Text style={s.label}>{children}</Text>;
}
export function Heading({ children }: React.PropsWithChildren) {
  return <Text style={s.heading}>{children}</Text>;
}
export function Copy({ children }: React.PropsWithChildren) {
  return <Text style={s.copy}>{children}</Text>;
}
export function Card({ children }: React.PropsWithChildren) {
  return <View style={s.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  quiet = false,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        quiet && s.quiet,
        disabled && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[s.buttonText, quiet && { color: colors.green }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  secure = false,
  numeric = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  secure?: boolean;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 7, marginVertical: 7 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        style={[
          s.input,
          multiline && { minHeight: 90, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Page({ children }: React.PropsWithChildren) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Busy() {
  return <ActivityIndicator style={{ margin: 16 }} color={colors.green} />;
}
export function Empty({ text }: { text: string }) {
  return (
    <Card>
      <Copy>{text}</Copy>
    </Card>
  );
}
export const s = StyleSheet.create({
  page: {
    padding: 22,
    paddingBottom: 48,
    gap: 15,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: colors.clay,
    textTransform: "uppercase",
  },
  heading: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : undefined,
    fontSize: 36,
    lineHeight: 43,
    color: colors.ink,
    letterSpacing: -1,
  },
  copy: { fontSize: 16, lineHeight: 24, color: colors.muted },
  card: {
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.paper,
    gap: 12,
  },
  button: {
    backgroundColor: colors.green,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  quiet: { backgroundColor: colors.sage },
  buttonText: { fontSize: 16, fontWeight: "600", color: "white" },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.paper,
    padding: 14,
    fontSize: 17,
    color: colors.ink,
    minHeight: 48,
  },
  title: { fontSize: 21, fontWeight: "600", color: colors.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  metric: { flex: 1, minWidth: 80, gap: 6 },
  number: {
    fontFamily: Platform.OS === "ios" ? "Georgia" : undefined,
    fontSize: 28,
    color: colors.ink,
  },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted },
  separator: { height: 1, backgroundColor: colors.line },
  error: { color: "#A02D24", fontSize: 15, lineHeight: 22 },
});
