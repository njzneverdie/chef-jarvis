import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Copy, Heading, Label, Page, s, useT } from "./ui";
import { useStore } from "./store";
import {
  Choice,
  MultiChoice,
  allergyOptions,
  equipmentOptions,
  skillOptions,
} from "./AccountScreens";

// First-run setup in three taps: allergies, equipment, cooking skill. Body
// stats and nutrition targets stay optional in Profile.
export function Onboarding() {
  const st = useStore(),
    t = useT();
  const [step, setStep] = useState(0),
    [allergies, setAllergies] = useState(""),
    [equipment, setEquipment] = useState(""),
    [skill, setSkill] = useState("beginner");
  const parts = (value: string) => [
    ...new Set(value.split(/[,，、]/).map((item) => item.trim()).filter(Boolean)),
  ];
  async function finish() {
    await st.saveProfile({
      app_user_id: st.userId,
      allergies: parts(allergies),
      equipment: parts(equipment),
      cooking_skill: skill,
      onboarding_completed: true,
    });
  }
  const titles = [
    t("Any food allergies?", "有沒有食物過敏？"),
    t("What can you cook with?", "家裡有哪些器材？"),
    t("How much do you cook?", "你的料理經驗？"),
  ];
  return (
    <Page>
      <Label>
        {t("Quick setup", "快速設定")} · {step + 1} / 3
      </Label>
      <Heading>{titles[step]}</Heading>
      <Card>
        {step === 0 && (
          <>
            <Copy>
              {t(
                "Jarvis never recommends what you choose here. Skip if none.",
                "這裡選的食材，Jarvis 絕不會推薦。沒有就直接下一步。",
              )}
            </Copy>
            <MultiChoice
              label={t("Allergies", "過敏原")}
              value={allergies}
              onChange={setAllergies}
              options={allergyOptions(t)}
            />
          </>
        )}
        {step === 1 && (
          <>
            <Copy>
              {t(
                "Recipes only use what you have. Pots and pans on the stove are always assumed.",
                "食譜只會用你有的器材；瓦斯爐上的鍋具一定會算在內。",
              )}
            </Copy>
            <MultiChoice
              label={t("Equipment", "廚房器材")}
              value={equipment}
              onChange={setEquipment}
              options={equipmentOptions(t)}
            />
          </>
        )}
        {step === 2 && (
          <>
            <Copy>
              {t(
                "Beginners get simpler techniques, fewer pots and clearer cues.",
                "新手會拿到較簡單的作法、較少鍋具與更清楚的提示。",
              )}
            </Copy>
            <Choice
              label={t("Cooking skill", "料理經驗")}
              value={skill}
              options={skillOptions(t)}
              onChange={setSkill}
            />
          </>
        )}
        <View style={s.row}>
          {step > 0 && (
            <Button
              quiet
              title={t("Back", "上一步")}
              onPress={() => setStep(step - 1)}
            />
          )}
          <Button
            disabled={st.busy}
            title={step < 2 ? t("Next", "下一步") : t("Start cooking", "開始使用")}
            onPress={() => (step < 2 ? setStep(step + 1) : st.run(finish))}
          />
        </View>
      </Card>
      <Button
        quiet
        title={t("Set up later in Profile", "稍後在「我的」設定")}
        onPress={() => st.skipOnboarding()}
      />
      <Text style={s.fieldLabel}>
        {t(
          "Height, weight and nutrition targets are optional in Profile.",
          "身高、體重與營養目標可稍後在「我的」補填。",
        )}
      </Text>
    </Page>
  );
}
