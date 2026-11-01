import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Copy, s, useT } from "./ui";
import { domain, useStore } from "./store";

type PantryIdea = {
  title: string;
  reason: string;
  minutes: number;
  uses: string[];
  expiring: string[];
  missing: string[];
};

// "What can I make?" from the server-side pantry. Choosing an idea hands it
// to the Plan screen, which generates the full measured recipe.
export function PantryIdeas({ go }: { go: (tab: string) => void }) {
  const st = useStore(),
    t = useT();
  const [ideas, setIdeas] = useState<PantryIdea[] | null>(null),
    [empty, setEmpty] = useState(false),
    [fallback, setFallback] = useState(false);
  async function load() {
    const result = await st.edge("chef-meal-plan", {
      mode: "pantry_ideas",
      language: st.lang,
      preferences: domain.buildMealPlanningPreferences(st.planningChoices),
    });
    setEmpty(Boolean(result.empty));
    setFallback(Boolean(result.fallback));
    setIdeas(Array.isArray(result.ideas) ? result.ideas : []);
  }
  return (
    <Card>
      <Text style={s.title}>
        {t("What can I make?", "用現有食材做什麼？")}
      </Text>
      <Copy>
        {t(
          "Jarvis suggests dishes from your pantry, using items that expire soonest first.",
          "Jarvis 會依你的庫存推薦料理，優先用掉快到期的食材。",
        )}
      </Copy>
      <Button
        disabled={st.busy}
        title={
          ideas
            ? t("Suggest again", "重新推薦")
            : t("See what I can make", "看看能做什麼")
        }
        onPress={() => st.run(load)}
      />
      {empty && (
        <Copy>
          {t(
            "Your pantry is empty (or only has items you avoid). Add ingredients first.",
            "庫存目前沒有可用的食材（或只有你避開的食材），請先新增食材。",
          )}
        </Copy>
      )}
      {fallback && !!ideas?.length && (
        <Copy>
          {t(
            "Smart suggestions are unavailable right now; these are simple ideas from your pantry.",
            "智慧推薦暫時無法使用，以下是依庫存整理的簡單建議。",
          )}
        </Copy>
      )}
      {(ideas || []).map((idea, index) => (
        <View key={`${idea.title}-${index}`} style={{ gap: 6 }}>
          <Text style={s.fieldLabel}>
            {idea.title} · {idea.minutes} {t("min", "分鐘")}
          </Text>
          <Copy>{idea.reason}</Copy>
          <Copy>
            {t("Uses: ", "使用：")}
            {idea.uses
              .map((name) =>
                idea.expiring.includes(name)
                  ? `${name}${t(" (expiring)", "（快到期）")}`
                  : name,
              )
              .join(t(", ", "、"))}
          </Copy>
          <Copy>
            {idea.missing.length
              ? `${t("Also need: ", "還需要：")}${idea.missing.join(t(", ", "、"))}`
              : t("Nothing else to buy.", "不用另外採買。")}
          </Copy>
          <Button
            quiet
            disabled={st.busy}
            title={t("Make this", "做這道")}
            onPress={() => {
              st.setPendingPantryIdea({ title: idea.title, uses: idea.uses });
              go("Plan");
            }}
          />
        </View>
      ))}
    </Card>
  );
}
