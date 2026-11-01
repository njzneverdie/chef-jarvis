import React from "react";
import { Alert, Text } from "react-native";
import { domain } from "./store";

// Step text with tappable cooking terms and spoon/cup measures. Must be
// rendered inside a <Text> so the spans flow inline.
export function StepText({
  text,
  ingredients,
  lang,
}: {
  text: string;
  ingredients?: any[];
  lang: "en" | "zh-TW";
}) {
  const segments = domain.stepSegments(text, ingredients || [], lang);
  return (
    <>
      {segments.map((segment: any, index: number) =>
        segment.kind === "text" ? (
          <Text key={index}>{segment.text}</Text>
        ) : (
          <Text
            key={index}
            accessibilityRole="button"
            accessibilityHint={segment.help}
            onPress={() => Alert.alert(segment.text, segment.help)}
            style={{ textDecorationLine: "underline", textDecorationStyle: "dotted", color: "#254C39" }}
          >
            {segment.text}
          </Text>
        ),
      )}
    </>
  );
}
