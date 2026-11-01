import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
  Button,
  Card,
  Copy,
  Empty,
  Field,
  Heading,
  Label,
  Page,
  s,
  useT,
} from "./ui";
import { domain, useStore } from "./store";
import { StepText } from "./StepText";
import { supabase, requireOK } from "./client";
import {
  remainingSeconds,
  toggleDeadline,
  recipeNutrition,
  resetKitchenTimer,
  validateMealCompletion,
} from "./mobile-domain.mjs";
import { Choice } from "./AccountScreens";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { PantryUse } from "./PantryUse";
import { VoiceControl } from "./VoiceControl";
import type { Timer } from "./types";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
export function useCookingAlarms() {
  const st = useStore(),
    chain = useRef(Promise.resolve()),
    latest = useRef(st.cooking),
    revision = useRef(0);
  latest.current = st.cooking;
  useEffect(() => {
    const rev = ++revision.current;
    let cancelled = false;
    const valid = () => !cancelled && revision.current === rev;
    chain.current = chain.current
      .catch(() => {})
      .then(async () => {
        if (!valid()) return;
        const state = latest.current;
        const scheduled =
          await Notifications.getAllScheduledNotificationsAsync();
        if (!valid()) return;
        const desired = (state?.timers || []).filter(
          (timer: Timer) =>
            timer.mode !== "stopwatch" &&
            timer.deadline &&
            remainingSeconds(timer) > 0,
        );
        for (const n of scheduled) {
          const target = desired.find((t: Timer) => t.id === n.identifier);
          if (!target || n.content.data?.deadline !== target.deadline)
            await Notifications.cancelScheduledNotificationAsync(n.identifier);
        }
        const permission = await Notifications.getPermissionsAsync();
        if (!valid() || !permission.granted) return;
        for (const timer of desired) {
          if (!valid()) return;
          if (
            scheduled.some(
              (n) =>
                n.identifier === timer.id &&
                n.content.data?.deadline === timer.deadline,
            )
          )
            continue;
          await Notifications.scheduleNotificationAsync({
            identifier: timer.id,
            content: {
              title: "Chef Jarvis",
              body: timer.label,
              sound: "default",
              data: { deadline: timer.deadline },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(timer.deadline),
            },
          });
        }
      })
      .catch((e: any) => {
        if (valid()) st.setError(e.message);
      });
    return () => {
      cancelled = true;
      revision.current++;
    };
  }, [st.cooking]);
}
export function CookScreen() {
  const st = useStore(),
    t = useT(),
    c = st.cooking;
  const [now, setNow] = useState(Date.now()),
    [customMinutes, setCustomMinutes] = useState("5"),
    [customLabel, setCustomLabel] = useState(""),
    [servings, setServings] = useState("1"),
    [rating, setRating] = useState(""),
    [note, setNote] = useState(""),
    [showFinish, setShowFinish] = useState(false),
    [tags, setTags] = useState<string[]>([]),
    [showTips, setShowTips] = useState(false),
    [showRescue, setShowRescue] = useState(false);
  const announced = useRef(new Set<string>());
  const [showSteps, setShowSteps] = useState(false);
  useEffect(() => {
    if (!c) return;
    activateKeepAwakeAsync("chef-cook").catch(() => {});
    const id = setInterval(() => setNow(Date.now()), 500);
    const listener = AppState.addEventListener("change", () =>
      setNow(Date.now()),
    );
    return () => {
      clearInterval(id);
      listener.remove();
      deactivateKeepAwake("chef-cook");
      Speech.stop();
    };
  }, [!!c]);
  useEffect(() => {
    for (const timer of c?.timers || []) {
      if (
        timer.mode !== "stopwatch" &&
        timer.deadline &&
        remainingSeconds(timer, now) === 0 &&
        !announced.current.has(timer.id)
      ) {
        announced.current.add(timer.id);
        Alert.alert(t("Timer complete", "計時完成"), timer.label);
      }
    }
  }, [now, c]);
  if (!c)
    return (
      <Page>
        <Heading>{t("One step at a time.", "一步一步，煮好一餐。")}</Heading>
        <Empty
          text={t(
            "Choose a measured recipe from Plan or Saved to start guided cooking.",
            "從規劃或收藏選擇份量完整的食譜，開始引導烹飪。",
          )}
        />
      </Page>
    );
  const step = c.recipe.steps[c.step];
  // A new session starts with prepDone === false; restored older sessions
  // have no flag and go straight to their step.
  if (c.prepDone === false) {
    const items = domain.prepChecklist(c.recipe, st.lang);
    const checked: string[] = c.prepChecks || [];
    const toggle = (id: string) =>
      st.setCooking((current: any) =>
        current?.startedAt !== c.startedAt
          ? current
          : {
              ...current,
              prepChecks: checked.includes(id)
                ? checked.filter((item) => item !== id)
                : [...checked, id],
            },
      );
    const done = () =>
      st.setCooking((current: any) =>
        current?.startedAt !== c.startedAt ? current : { ...current, prepDone: true },
      );
    return (
      <Page>
        <Label>{c.recipe.title}</Label>
        <Heading>{t("Before you start", "開煮前準備")}</Heading>
        <Copy>
          {t(
            "Cut everything and get your tools out first, so nothing burns while you prep.",
            "先切好食材、拿出器具，煮的時候就不會手忙腳亂。",
          )}
        </Copy>
        <Card>
          {items.map((item: any) => {
            const isChecked = checked.includes(item.id);
            return (
              <Button
                key={item.id}
                quiet={!isChecked}
                title={`${isChecked ? "✓" : "○"}  ${item.text}`}
                onPress={() => toggle(item.id)}
              />
            );
          })}
        </Card>
        <Button
          disabled={items.some((item: any) => !checked.includes(item.id))}
          title={t("Start cooking", "開始烹飪")}
          onPress={done}
        />
        <Button quiet title={t("Skip (I am ready)", "略過（已準備好）")} onPress={done} />
      </Page>
    );
  }
  const setTimers = (timers: Timer[]) => st.setCooking({ ...c, timers });
  async function startTimer(label: string, seconds: number, id: string) {
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted)
      permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted)
      Alert.alert(
        t("Notifications disabled", "通知未啟用"),
        t(
          "Timers still work on screen. Enable notifications in Settings to receive background alerts.",
          "畫面計時仍可使用；如需背景提醒，請至設定開啟通知。",
        ),
      );
    const existing = c.timers.find((v: Timer) => v.id === id);
    if (existing) return;
    st.setCooking((current: any) =>
      !current ||
      current.startedAt !== c.startedAt ||
      current.timers.some((v: Timer) => v.id === id)
        ? current
        : {
            ...current,
            timers: [
              ...current.timers,
              {
                id,
                label,
                duration: seconds,
                remaining: seconds,
                deadline: Date.now() + seconds * 1000,
              },
            ],
          },
    );
  }
  async function finish() {
    if (note.length > 300)
      throw new Error(
        t("Keep notes within 300 characters.", "心得最多 300 字。"),
      );
    const { amount, rating: starRating } = validateMealCompletion(
      servings,
      rating,
    );
    const selectedRating = starRating ?? domain.feedbackRatingForTags(tags);
    if (c.recipe.source_persistence === "session_only") {
      await st.endCooking("completed");
      setShowFinish(false);
      return;
    }
    const multiplier = amount / Math.max(1, c.recipe.servings);
    const n = recipeNutrition(c.recipe);
    if (!n)
      throw new Error(
        t(
          "Nutrition changed after a swap. Recheck USDA before logging, or end without logging.",
          "替換食材後需先查詢 USDA 再記錄營養，或選擇不記錄並結束。",
        ),
      );
    await st.mutate(
      "nutrition_logs",
      {
        id: c.logId,
        user_id: st.userId,
        app_user_id: st.userId,
        recipe_id: c.recipe.saved_recipe_id || null,
        recipe_title: c.recipe.title,
        eaten_on: domain.localDateKey(new Date()),
        calories: Number(n.kcal || 0) * multiplier,
        protein_g: Number(n.protein_g || 0) * multiplier,
        carbs_g: Number(n.carbs_g || 0) * multiplier,
        fat_g: Number(n.fat_g || 0) * multiplier,
        servings_eaten: amount,
        nutrition_source: domain.hasCompleteUsdaNutrition(
          c.recipe.usda_nutrition,
        )
          ? "usda_reference"
          : "recipe_estimate",
        usda_coverage: domain.hasCompleteUsdaNutrition(c.recipe.usda_nutrition)
          ? c.recipe.usda_nutrition.coverage_percent
          : null,
      },
      "upsert",
    );
    if (selectedRating !== null) {
      const feedback = {
        id: c.feedbackId,
        user_id: st.userId,
        recipe_id: c.recipe.saved_recipe_id || null,
        recipe_title: c.recipe.title,
        rating: selectedRating,
        note,
      };
      try {
        await st.mutate("recipe_feedback", { ...feedback, tags }, "upsert");
      } catch (error: any) {
        // Before the optional tags column exists, keep the rating and note.
        if (!/tags/.test(String(error?.message || ""))) throw error;
        await st.mutate("recipe_feedback", feedback, "upsert");
      }
    }
    await st.endCooking("completed");
    setShowFinish(false);
    Alert.alert(t("Meal logged. Enjoy!", "餐點已記錄，好好享用！"));
  }
  return (
    <Page>
      <Label>{c.recipe.title}</Label>
      <Copy>
        {t("Step", "步驟")} {c.step + 1} / {c.recipe.steps.length}
      </Copy>
      <Heading>
        <StepText text={step.instruction} ingredients={c.recipe.ingredients} lang={st.lang} />
      </Heading>
      <Copy>{t("Tap underlined words for help.", "點有底線的字可看說明。")}</Copy>
      <Button
        quiet
        title={t("Read this step aloud", "朗讀這個步驟")}
        onPress={() => {
          Speech.stop();
          (ExpoSpeechRecognitionModule.abort(),
            Speech.speak(step.instruction, {
              language: st.lang === "zh-TW" ? "zh-TW" : "en-US",
            }));
        }}
      />
      {(step.timers || []).map((timer: any, i: number) => {
        const id = `recipe-${c.startedAt}-${c.step}-${i}`;
        return (
          <Button
            key={id}
            disabled={c.timers.some((v: Timer) => v.id === id)}
            quiet
            title={`${t("Start timer", "啟動計時")} · ${timer.label} · ${Math.round((timer.duration_seconds / 60) * 10) / 10} ${t("min", "分鐘")}`}
            onPress={() =>
              st.run(() => startTimer(timer.label, timer.duration_seconds, id))
            }
          />
        );
      })}
      {!!(step.doneness || step.rescue) && (
        <Button
          quiet
          title={showTips ? t("Hide tips", "收起提示") : t("How do I know it is done?", "怎樣算煮好？")}
          onPress={() => setShowTips((value) => !value)}
        />
      )}
      {showTips && !!step.doneness && (
        <Copy>
          {t("Done when: ", "熟度判斷：")}
          {step.doneness}
        </Copy>
      )}
      {showTips && !!step.rescue && (
        <Copy>
          {t("If it goes wrong: ", "失敗怎麼救：")}
          {step.rescue}
        </Copy>
      )}
      <Button
        quiet
        title={showRescue ? t("Hide quick fixes", "收起常見狀況") : t("Quick fixes: too salty, burnt…", "常見狀況怎麼救：太鹹、燒焦…")}
        onPress={() => setShowRescue((value) => !value)}
      />
      {showRescue &&
        domain.genericRescueTips(st.lang).map(([problem, fix]: string[]) => (
          <Copy key={problem}>
            {problem}
            {t(": ", "：")}
            {fix}
          </Copy>
        ))}
      <View style={s.row}>
        <Button
          quiet
          title={t("Previous", "上一步")}
          disabled={c.step === 0}
          onPress={() => {
            setShowTips(false);
            st.setCooking({ ...c, step: c.step - 1 });
          }}
        />
        <Button
          title={
            c.step === c.recipe.steps.length - 1
              ? t("Finish cooking", "完成烹飪")
              : t("Next step", "下一步")
          }
          onPress={() =>
            c.step === c.recipe.steps.length - 1
              ? setShowFinish(true)
              : (setShowTips(false), st.setCooking({ ...c, step: c.step + 1 }))
          }
        />
      </View>
      <Button
        quiet
        title={
          showSteps
            ? t("Hide steps", "收起全部步驟")
            : t("View all steps", "查看全部步驟")
        }
        onPress={() => setShowSteps((value) => !value)}
      />
      {showSteps &&
        c.recipe.steps.map((item: any, index: number) => (
          <Button
            key={index}
            quiet={index !== c.step}
            title={`${index + 1}. ${item.instruction}`}
            onPress={() => st.setCooking({ ...c, step: index })}
          />
        ))}
      <VoiceControl
        onCommand={(text) => {
          const value = text.toLowerCase();
          if (/next|下一步/.test(value))
            st.setCooking((current: any) =>
              current?.startedAt === c.startedAt
                ? {
                    ...current,
                    step: Math.min(
                      current.recipe.steps.length - 1,
                      current.step + 1,
                    ),
                  }
                : current,
            );
          else if (/previous|back|上一步/.test(value))
            st.setCooking((current: any) =>
              current?.startedAt === c.startedAt
                ? { ...current, step: Math.max(0, current.step - 1) }
                : current,
            );
          else if (/read|朗讀|念/.test(value))
            (ExpoSpeechRecognitionModule.abort(),
              Speech.speak(step.instruction, {
                language: st.lang === "zh-TW" ? "zh-TW" : "en-US",
              }));
          else if (/timer|計時/.test(value)) {
            const timer = step.timers?.[0];
            if (timer)
              st.run(() =>
                startTimer(
                  timer.label,
                  timer.duration_seconds,
                  `recipe-${c.startedAt}-${c.step}-0`,
                ),
              );
          } else
            st.setError(
              t(
                "Try next, previous, read aloud, or start timer.",
                "請說下一步、上一步、朗讀或開始計時。",
              ),
            );
        }}
      />
      <Label>{t("Kitchen timers", "廚房計時器")}</Label>
      {!c.timers.length && (
        <Copy>
          {t(
            "Timers start only when you choose them. They continue by clock time while the app is in the background.",
            "計時器由你手動啟動。App 在背景時仍依實際時間計算。",
          )}
        </Copy>
      )}
      {c.timers.map((timer: Timer) => {
        const left = remainingSeconds(timer, now);
        return (
          <Card key={timer.id}>
            <Text style={s.fieldLabel}>
              {timer.label}
              {timer.mode === "stopwatch" ? t(" · Stopwatch", "・碼表") : ""}
            </Text>
            <Text style={[s.number, { fontVariant: ["tabular-nums"] }]}>
              {String(Math.floor(left / 60)).padStart(2, "0")}:
              {String(left % 60).padStart(2, "0")}
            </Text>
            <View style={s.row}>
              <Button
                quiet
                title={
                  timer.deadline ? t("Pause", "暫停") : t("Resume", "繼續")
                }
                disabled={timer.mode !== "stopwatch" && left === 0}
                onPress={() =>
                  setTimers(
                    c.timers.map((v: Timer) =>
                      v.id === timer.id ? toggleDeadline(v) : v,
                    ),
                  )
                }
              />
              <Button
                quiet
                title={t("Reset", "重設")}
                disabled={timer.mode !== "stopwatch" && !timer.duration}
                onPress={() => {
                  announced.current.delete(timer.id);
                  setTimers(
                    c.timers.map((value: Timer) =>
                      value.id === timer.id ? resetKitchenTimer(value) : value,
                    ),
                  );
                }}
              />
              <Button
                quiet
                title={t("Remove", "移除")}
                onPress={() =>
                  setTimers(c.timers.filter((v: Timer) => v.id !== timer.id))
                }
              />
            </View>
          </Card>
        );
      })}
      <Card>
        <Text style={s.title}>{t("Your own timer", "自訂計時器")}</Text>
        <Field
          label={t("Label", "名稱")}
          value={customLabel}
          onChange={setCustomLabel}
        />
        <Field
          label={t("Minutes", "分鐘")}
          value={customMinutes}
          onChange={setCustomMinutes}
          numeric
        />
        <Button
          quiet
          title={t("Start timer", "啟動計時")}
          onPress={() =>
            st.run(async () => {
              const minutes = Number(customMinutes);
              if (
                !customLabel.trim() ||
                !Number.isFinite(minutes) ||
                Math.round(minutes * 60) < 1 ||
                minutes > 1440
              )
                throw new Error(
                  t(
                    "Enter a name and 0–1440 minutes.",
                    "請輸入名稱與大於 0、最多 1440 分鐘。",
                  ),
                );
              await startTimer(
                customLabel.trim(),
                Math.round(minutes * 60),
                `custom-${Date.now()}`,
              );
              setCustomLabel("");
            })
          }
        />
        <Button
          quiet
          title={t("Start stopwatch", "啟動碼表")}
          onPress={() => {
            if (!customLabel.trim()) {
              st.setError(
                t("Name your stopwatch first.", "請先輸入碼表名稱。"),
              );
              return;
            }
            setTimers([
              ...c.timers,
              {
                id: `stopwatch-${Date.now()}`,
                mode: "stopwatch",
                label: customLabel.trim(),
                remaining: 0,
                deadline: Date.now(),
              },
            ]);
            setCustomLabel("");
          }}
        />
      </Card>
      <PantryUse />
      {showFinish && (
        <Card>
          <Text style={s.title}>
            {t("How was your meal?", "這一餐，吃得如何？")}
          </Text>
          {c.recipe.source_persistence === "session_only" ? (
            <Copy>
              {t(
                "This sourced recipe is not stored. Finishing clears this cooking session.",
                "此來源食譜不會儲存；完成後將清除本次進度。",
              )}
            </Copy>
          ) : (
            <>
              <Text style={s.fieldLabel}>
                {t("Servings eaten", "實際食用份數")}: {servings}
              </Text>
              <View style={s.row}>
                <Button
                  quiet
                  title={t("Fewer servings", "減少份數")}
                  disabled={Number(servings) <= 0.25}
                  onPress={() =>
                    setServings(String(Math.max(0.25, Number(servings) - 0.25)))
                  }
                />
                <Button
                  quiet
                  title={t("More servings", "增加份數")}
                  disabled={Number(servings) >= 12}
                  onPress={() =>
                    setServings(String(Math.min(12, Number(servings) + 0.25)))
                  }
                />
              </View>
              <Text style={s.fieldLabel}>
                {t("How was it? (optional, pick any)", "這道菜如何？（可複選，可略過）")}
              </Text>
              <View style={s.row}>
                {domain.feedbackTagOptions.map(([value, en, zh]: string[]) => {
                  const selected = tags.includes(value);
                  return (
                    <Button
                      key={value}
                      quiet={!selected}
                      title={`${selected ? "✓ " : ""}${t(en, zh)}`}
                      onPress={() =>
                        setTags((current) =>
                          current.includes(value)
                            ? current.filter((item) => item !== value)
                            : [...current, value],
                        )
                      }
                    />
                  );
                })}
              </View>
              <Choice
                label={t("Feedback (optional)", "回饋（可略過）")}
                value={rating}
                onChange={(value) => {
                  setRating(value);
                  if (!value) setNote("");
                }}
                options={[
                  ["", t("Skip feedback", "略過回饋")],
                  ...[1, 2, 3, 4, 5].map((value) => [
                    String(value),
                    `${value} ★`,
                  ]),
                ]}
              />
              {rating !== "" && (
                <Field
                  label={t("Notes (optional)", "心得（選填）")}
                  value={note}
                  onChange={setNote}
                  multiline
                />
              )}
              <Copy>
                {t(
                  "Skipping feedback still logs your meal nutrition.",
                  "略過回饋仍會照常記錄餐點營養。",
                )}
              </Copy>
            </>
          )}
          <Button
            title={t("Finish & log meal", "完成並記錄餐點")}
            disabled={st.busy}
            onPress={() => st.run(finish)}
          />
          <Button
            quiet
            title={t("Keep cooking", "繼續料理")}
            onPress={() => setShowFinish(false)}
          />
        </Card>
      )}
      <Button
        quiet
        title={t("End cooking without logging", "結束烹飪，不記錄餐點")}
        onPress={() =>
          Alert.alert(
            t("End this cooking session?", "結束本次烹飪？"),
            t("Current timers will be cancelled.", "目前的計時通知將取消。"),
            [
              { text: t("Cancel", "取消"), style: "cancel" },
              {
                text: t("End cooking", "結束烹飪"),
                style: "destructive",
                onPress: () =>
                  st.run(async () => {
                    await st.endCooking();
                  }),
              },
            ],
          )
        }
      />
    </Page>
  );
}
