import React, { useEffect, useState } from "react";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
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
import { supabase, requireOK } from "./client";
import { randomUUID } from "expo-crypto";
import {
  applyRecipeSwap,
  recipeNutrition,
  validateMeasuredRecipe,
} from "./mobile-domain.mjs";
import type { Recipe } from "./types";
export function HomeScreen({ go }: { go: (tab: string) => void }) {
  const st = useStore(),
    t = useT();
  const today = domain.localDateKey(new Date());
  const logs = (st.data.nutrition_logs || []).filter(
    (n: any) => n.eaten_on === today,
  );
  const kcal = logs.reduce(
      (a: number, n: any) => a + Number(n.calories || 0),
      0,
    ),
    protein = logs.reduce(
      (a: number, n: any) => a + Number(n.protein_g || 0),
      0,
    );
  return (
    <Page>
      <Label>
        {new Date().toLocaleDateString(st.lang, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </Label>
      <Heading>
        {t("A good meal\nstarts here.", "把今天，\n好好煮一餐。")}
      </Heading>
      <Copy>
        {t(
          "No dish in mind? Jarvis can decide using your food profile.",
          "不用先想菜名，Jarvis 會依你的飲食設定幫你決定。",
        )}
      </Copy>
      <Button
        title={t("Plan a meal", "開始規劃餐點")}
        onPress={() => go("Plan")}
      />
      {!st.profile?.onboarding_completed && (
        <Card>
          <Text style={s.title}>
            {t("First, your food profile", "先設定你的飲食需求")}
          </Text>
          <Copy>
            {t(
              "Set your goals, allergies and kitchen equipment before generating a meal.",
              "先填寫目標、過敏原與廚房器材，再開始產生食譜。",
            )}
          </Copy>
          <Button
            quiet
            title={t("Set up profile", "設定飲食資料")}
            onPress={() => go("Profile")}
          />
        </Card>
      )}
      <Button
        quiet
        disabled={st.busy}
        title={t("Refresh cloud data", "更新雲端資料")}
        onPress={() => st.run(st.refresh)}
      />
      <Label>{t("Today, so far", "今天的營養記錄")}</Label>
      <Card>
        <View style={s.row}>
          <View style={s.metric}>
            <Text style={s.number}>{Math.round(kcal)}</Text>
            <Copy>{t("kcal logged", "大卡已記錄")}</Copy>
          </View>
          <View style={s.metric}>
            <Text style={s.number}>{Math.round(protein)}g</Text>
            <Copy>{t("protein", "蛋白質")}</Copy>
          </View>
        </View>
        <Copy>
          {t("Carbs", "碳水")}:{" "}
          {Math.round(
            logs.reduce(
              (sum: number, row: any) => sum + Number(row.carbs_g || 0),
              0,
            ),
          )}
          g · {t("Fat", "脂肪")}:{" "}
          {Math.round(
            logs.reduce(
              (sum: number, row: any) => sum + Number(row.fat_g || 0),
              0,
            ),
          )}
          g
        </Copy>
        <Copy>
          {t(
            `Daily target: ${st.profile?.calorie_target || "—"} kcal · ${st.profile?.protein_g || "—"}g protein`,
            `每日目標：${st.profile?.calorie_target || "—"} 大卡・${st.profile?.protein_g || "—"} 克蛋白質`,
          )}
        </Copy>
        <Button
          quiet
          title={t("Nutrition journal", "營養日誌")}
          onPress={() => go("Nutrition")}
        />
      </Card>
      {st.cooking && (
        <Card>
          <Label>{t("On the stove", "正在烹飪")}</Label>
          <Text style={s.title}>{st.cooking.recipe.title}</Text>
          <Button
            title={t("Continue cooking", "繼續烹飪")}
            onPress={() => go("Cook")}
          />
        </Card>
      )}
      <View style={s.row}>
        <Button
          quiet
          title={t("Pantry", "食材庫")}
          onPress={() => go("Pantry")}
        />
        <Button
          quiet
          title={t("Shopping", "購物清單")}
          onPress={() => go("Shopping")}
        />
        <Button
          quiet
          title={t("This week", "本週菜單")}
          onPress={() => go("Week")}
        />
        <Button
          quiet
          title={t("Saved recipes", "收藏食譜")}
          onPress={() => go("Saved")}
        />
      </View>
    </Page>
  );
}
export function PlanScreen({ go }: { go: (s: string) => void }) {
  const st = useStore(),
    t = useT();
  const choices: Record<string, string> = st.planningChoices;
  const setChoices = st.setPlanningChoices;
  const recipe: Recipe | null = st.plannedRecipe;
  const setRecipe = st.setPlannedRecipe;
  const [showOptions, setShowOptions] = useState(false),
    [clarification, setClarification] = useState<any>(null),
    [skipped, setSkipped] = useState<string[]>([]),
    [planning, setPlanning] = useState(false),
    [planningStage, setPlanningStage] = useState(0);
  // Same staged wait copy as the web planner (8 s and 22 s).
  useEffect(() => {
    setPlanningStage(0);
    if (!planning) return;
    const timers = [
      setTimeout(() => setPlanningStage(1), 8000),
      setTimeout(() => setPlanningStage(2), 22000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [planning]);
  async function generate(text: string, avoid: string[] = []) {
    if (!st.profile?.onboarding_completed)
      throw new Error(
        t("Complete your food profile first.", "請先完成飲食設定。"),
      );
    setClarification(null);
    setPlanning(true);
    try {
      await requestPlan(text, avoid);
    } finally {
      setPlanning(false);
    }
  }
  async function requestPlan(text: string, avoid: string[]) {
    const result = await st.edge("chef-meal-plan", {
      request: text.trim(),
      language: st.lang,
      constraints: {
        servings: Number(choices.servings),
        max_minutes: choices.time === "any" ? null : Number(choices.time),
      },
      ...(avoid.length ? { avoid_titles: avoid } : {}),
    });
    if (result.clarification_required) {
      setClarification(result);
      return;
    }
    if (!result.plan)
      throw new Error(t("No valid recipe returned.", "未取得有效食譜。"));
    setRecipe(result.plan);
  }
  return (
    <Page>
      <Label>{t("Your next meal", "你的下一餐")}</Label>
      <Heading>{t("Let Jarvis decide.", "這一餐，交給 Jarvis。")}</Heading>
      <Copy>
        {t(
          "Start with the defaults, or tap a few choices. No typing needed.",
          "直接幫你選，也可以點幾個條件。不用想菜名、不用打字。",
        )}
      </Copy>
      <Button
        disabled={st.busy}
        title={
          st.busy
            ? t("Preparing your recipe…", "正在準備食譜…")
            : t("Decide my meal", "幫我決定這一餐")
        }
        onPress={() =>
          st.run(() =>
            generate(domain.buildMealPlanningRequest(choices, st.lang)),
          )
        }
      />
      {planning && (
        <Text accessibilityLiveRegion="polite" style={s.fieldLabel}>
          {
            [
              t(
                "Jarvis is planning exact ingredients, quantities, and cooking steps…",
                "Jarvis 正在規劃精確食材、份量與料理步驟…",
              ),
              t(
                "Checking every step and timer; a detailed recipe can take about 30 seconds…",
                "正在核對每個步驟與倒數計時，詳細食譜可能需要約 30 秒…",
              ),
              t(
                "Still finishing your recipe; please keep this screen open…",
                "仍在完成食譜，請保持此畫面開啟…",
              ),
            ][planningStage]
          }
        </Text>
      )}
      {recipe && (
        <Button
          quiet
          disabled={st.busy}
          title={t("Try another (same choices)", "換一道（保留目前條件）")}
          onPress={() =>
            st.run(async () => {
              const avoid = [recipe.title, ...skipped]
                .filter((title, i, all) => title && all.indexOf(title) === i)
                .slice(0, 5);
              await generate(
                domain.buildMealPlanningRequest(choices, st.lang),
                avoid,
              );
              setSkipped(avoid);
            })
          }
        />
      )}
      {domain.mealPlanningGroups
        .filter((group: any) => !group.optional || showOptions)
        .map((group: any) => (
          <View key={group.key} style={{ gap: 9 }}>
            <Text style={s.fieldLabel}>
              {st.lang === "zh-TW" ? group.zh : group.en}
            </Text>
            <View style={s.row}>
              {group.options.map(([value, en, zh]: string[]) => {
                const selected = choices[group.key] === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={st.lang === "zh-TW" ? zh : en}
                    accessibilityState={{ selected, disabled: st.busy }}
                    disabled={st.busy}
                    onPress={() =>
                      setChoices((previous: Record<string, string>) => ({
                        ...previous,
                        [group.key]: value,
                      }))
                    }
                    style={[s.button, !selected && s.quiet]}
                  >
                    <Text
                      style={[s.buttonText, !selected && { color: "#254C39" }]}
                    >
                      {selected ? "✓ " : ""}
                      {st.lang === "zh-TW" ? zh : en}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      <Button
        quiet
        title={
          showOptions
            ? t("Fewer options", "收起其他條件")
            : t(
                "Optional: meal, priorities & cuisine",
                "其他條件：餐別、偏好與風味（可不選）",
              )
        }
        onPress={() => setShowOptions((value) => !value)}
      />
      <Copy>
        {t(
          "Saved allergies, dietary restrictions and equipment are applied automatically. Nutrition is an estimate; check ingredient labels.",
          "過敏原、飲食限制與器材會自動套用個人設定。營養為估算，請確認食材標示。",
        )}
      </Copy>
      {clarification && (
        <Card>
          <Text style={s.title}>
            {t("Which dish did you mean?", "你指的是哪一道料理？")}
          </Text>
          <Copy>
            {clarification.message ||
              t(
                "Choose a suggested dish, or let Jarvis recommend another meal.",
                "點選建議料理，或讓 Jarvis 重新推薦一餐。",
              )}
          </Copy>
          {(clarification.candidates || []).map((c: any, i: number) => {
            const name = typeof c === "string" ? c : c.label || c.name;
            return (
              <Button
                quiet
                key={i}
                title={name}
                disabled={st.busy}
                onPress={() => {
                  st.run(() => generate(name));
                }}
              />
            );
          })}
        </Card>
      )}
      {recipe && (
        <RecipeCard
          key={JSON.stringify([recipe.title, recipe.ingredients])}
          recipe={recipe}
          onChange={setRecipe}
          go={go}
        />
      )}
    </Page>
  );
}
export function RecipeCard({
  recipe: r,
  onChange,
  go,
}: {
  recipe: Recipe;
  onChange?: (r: Recipe) => void;
  go: (s: string) => void;
}) {
  const st = useStore(),
    t = useT(),
    [usda, setUsda] = useState<any>(null);
  const safe = validateMeasuredRecipe(r),
    ephemeral = r.source_persistence === "session_only";
  async function grocery() {
    if (!safe)
      throw new Error(
        t(
          "Regenerate this recipe with measured ingredients.",
          "請重新產生有完整份量的食譜。",
        ),
      );
    if (ephemeral)
      throw new Error(
        t(
          "This sourced recipe is available in this session only.",
          "此來源食譜僅限本次使用。",
        ),
      );
    const saved = await st.saveRecipe(r);
    onChange?.(saved);
    const list = await st.scoped(async () => {
      const row = requireOK(
        await supabase
          .from("shopping_lists")
          .insert({
            user_id: st.userId,
            app_user_id: st.userId,
            title: r.title,
            recipe_id: saved.saved_recipe_id,
          })
          .select()
          .single(),
      ).data;
      const inserted = await supabase.from("shopping_list_items").insert(
        r.ingredients.map((i) => ({
          shopping_list_id: row.id,
          ingredient: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category || "other",
        })),
      );
      if (inserted.error) {
        await supabase
          .from("shopping_lists")
          .delete()
          .eq("id", row.id)
          .eq("user_id", st.userId);
        throw inserted.error;
      }
      return row;
    });
    await st.refresh();
    go("Shopping");
  }
  function start() {
    const begin = () =>
      st.run(async () => {
        if (st.cooking) await st.endCooking();
        st.setCooking({
          recipe: r,
          step: 0,
          timers: [],
          startedAt: new Date().toISOString(),
          cloudId: randomUUID(),
          logId: randomUUID(),
          feedbackId: randomUUID(),
        });
        go("Cook");
      });
    if (st.cooking)
      Alert.alert(
        t("Replace current cooking?", "取代目前烹飪進度？"),
        t(
          "Current local timers will be cancelled.",
          "目前的本機計時通知將取消。",
        ),
        [
          { text: t("Cancel", "取消"), style: "cancel" },
          { text: t("Replace", "取代"), onPress: begin },
        ],
      );
    else begin();
  }
  function swap(sub: any) {
    const next = applyRecipeSwap(r, sub, domain.applyIngredientSubstitution);
    if (next.image)
      next.image = { ...next.image, match_kind: "representative" };
    next.title = domain.recipeTitleAfterSubstitution(r.title, sub.from, sub.to);
    onChange?.(next);
    setUsda(null);
  }
  const reference =
    usda ||
    (r.usda_nutrition?.complete !== undefined ? r.usda_nutrition : null);
  const n = reference || recipeNutrition(r);
  const number = (value: any) =>
    value == null || !Number.isFinite(Number(value))
      ? "—"
      : Math.round(Number(value) / Math.max(1, r.servings || 1));
  const servings = Math.max(1, r.servings || 1);
  const safeURL = (url?: string) => url && domain.safeExternalUrl(url);
  return (
    <>
      <Card>
        <Label>
          {ephemeral
            ? t("Sourced recipe · session only", "來源食譜・僅限本次使用")
            : r.fallback
              ? t("Measured fallback recipe", "備用食譜")
              : t("Your meal plan", "你的料理計畫")}
        </Label>
        <Text style={s.title}>{r.title}</Text>
        {r.image && safeURL(r.image.url) && (
          <>
            <Image
              accessibilityLabel={r.title}
              source={{ uri: r.image.url }}
              style={{ width: "100%", height: 190, borderRadius: 8 }}
              resizeMode="cover"
            />
            <Copy>
              {r.image.match_kind !== "exact"
                ? t("Representative image · ", "示意圖片・")
                : ""}
              {r.image.creator} · {r.image.license}
            </Copy>
            {safeURL(r.image.description_url) && (
              <Button
                quiet
                title={t("Image credit", "圖片來源")}
                onPress={() => Linking.openURL(r.image!.description_url)}
              />
            )}
          </>
        )}
        {r.fallback && (
          <Copy>
            {t(
              "AI generation was unavailable. This is a measured backup recipe; review its ingredients before cooking.",
              "AI 暫時未能完成生成，這是份量完整的備援食譜，請先確認食材。",
            )}
          </Copy>
        )}
        <Copy>{r.summary}</Copy>
        <Copy>
          {r.minutes} {t("min", "分鐘")} · {r.servings} {t("servings", "人份")}
        </Copy>
        {n ? (
          <>
            <Text style={s.number}>{number(n.kcal)} kcal</Text>
            <Copy>
              {t("Per serving", "每份")} · P {number(n.protein_g)}g · C{" "}
              {number(n.carbs_g)}g · F {number(n.fat_g)}g
            </Copy>
          </>
        ) : (
          <Copy>
            {t(
              "Nutrition needs recalculation after this swap.",
              "替換食材後，營養數值需要重新計算。",
            )}
          </Copy>
        )}
        <Copy>
          {reference
            ? t(
                "USDA ingredient reference. Only complete ingredient and nutrient coverage is used for meal logs; otherwise the AI estimate is retained.",
                "USDA 食材參考值。僅完整配對的食材與營養資料用於餐點記錄；不完整時保留 AI 估算。",
              )
            : t("AI nutrition estimate", "AI 營養估算")}
        </Copy>
        {safeURL(r.source_url) && (
          <Button
            quiet
            title={
              r.source_title ||
              r.source_provider ||
              t("Recipe source", "食譜來源")
            }
            onPress={() => Linking.openURL(r.source_url!)}
          />
        )}
      </Card>
      <Card>
        <Text style={s.title}>{t("The ingredients", "準備食材")}</Text>
        {(r.ingredients || []).map((i: any, index) => (
          <View key={index} style={{ gap: 4 }}>
            <Text style={s.fieldLabel}>
              {typeof i === "string"
                ? i
                : `${i.quantity} ${domain.unitLabel(i.unit, st.lang, i.quantity)} · ${i.name}`}
            </Text>
            {!!i.preparation && <Copy>{i.preparation}</Copy>}
          </View>
        ))}
      </Card>
      {!safe && (
        <Copy>
          {t(
            "This older recipe needs exact measurements and steps. Generate a fresh version before cooking.",
            "這份舊食譜缺少完整份量或步驟。請重新產生後再烹飪。",
          )}
        </Copy>
      )}
      <Button
        title={t("Start guided cooking", "開始引導烹飪")}
        disabled={!safe || st.busy}
        onPress={start}
      />
      {!ephemeral && (
        <View style={{ gap: 10 }}>
          <Button
            quiet
            disabled={!safe || st.busy || !!r.saved_recipe_id}
            title={
              r.saved_recipe_id
                ? t("Saved", "已收藏")
                : t("Save for later", "收藏食譜")
            }
            onPress={() =>
              st.run(async () => onChange?.(await st.saveRecipe(r)))
            }
          />
          <Button
            quiet
            disabled={!safe || st.busy}
            title={t("Create grocery list", "建立購物清單")}
            onPress={() => st.run(grocery)}
          />
          <Button
            quiet
            disabled={!safe || st.busy}
            title={t("Check USDA nutrition", "查詢 USDA 營養")}
            onPress={() =>
              st.run(async () => {
                const result = await st.edge("chef-usda-nutrition", {
                  ingredients: r.ingredients.map(domain.normalizeGroceryItem),
                });
                const foods = (result.foods || []).filter((f: any) => f.found);
                if (!foods.length)
                  throw new Error(
                    t("No USDA matches found.", "找不到 USDA 配對資料。"),
                  );
                const total = domain.calculateUsdaMealNutrition(
                  r.ingredients,
                  foods,
                );
                if (!total.matched_ingredients)
                  throw new Error(
                    t(
                      "USDA matches have no convertible ingredient weights. Your estimate is unchanged.",
                      "USDA 配對缺少可換算克重，原營養估算未變更。",
                    ),
                  );
                setUsda(total);
                onChange?.({ ...r, usda_nutrition: total });
              })
            }
          />
        </View>
      )}
      {!!r.substitutions?.length && onChange && (
        <Card>
          <Text style={s.title}>
            {t("Make it fit you", "符合你的飲食目標")}
          </Text>
          {r.substitutions.map((sub, i) => (
            <View key={i} style={{ gap: 8 }}>
              <Text style={s.fieldLabel}>
                {sub.from} → {sub.to}
              </Text>
              <Copy>{sub.reason}</Copy>
              <Button
                quiet
                title={t("Use this swap", "套用替換")}
                onPress={() => swap(sub)}
              />
            </View>
          ))}
        </Card>
      )}
      <Card>
        <Text style={s.title}>{t("Before you begin", "先看一下作法")}</Text>
        {(r.steps || []).map((step: any, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Label>
              {t("Step", "步驟")} {i + 1}
            </Label>
            <Copy>{typeof step === "string" ? step : step.instruction}</Copy>
          </View>
        ))}
      </Card>
      {!!r.equipment_adaptations?.length && (
        <Card>
          <Text style={s.title}>
            {t("Equipment alternatives", "器材替代方案")}
          </Text>
          {r.equipment_adaptations.map((a: any, i) => (
            <Copy key={i}>
              {a.original} → {a.alternative}
              {"\n"}
              {a.instructions}
            </Copy>
          ))}
        </Card>
      )}
      {!!r.reuse_ideas?.length && (
        <Card>
          <Text style={s.title}>{t("Use what is left", "把剩餘食材用好")}</Text>
          {r.reuse_ideas.map((idea: any, i) => (
            <View key={i}>
              <Text style={s.fieldLabel}>{idea.title}</Text>
              <Copy>
                {idea.uses?.join(", ")}
                {"\n"}
                {idea.why}
              </Copy>
              <Button
                quiet
                title={t("Save idea", "收藏靈感")}
                disabled={ephemeral || st.busy}
                onPress={() =>
                  st.run(() =>
                    st.mutate("saved_meal_cards", {
                      app_user_id: st.userId,
                      title: idea.title,
                      uses: idea.uses || [],
                      why: idea.why,
                      source_recipe_title: r.title,
                    }),
                  )
                }
              />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}
export function SavedScreen({ go }: { go: (s: string) => void }) {
  const st = useStore(),
    t = useT(),
    [selected, setSelected] = useState<Recipe | null>(null);
  return (
    <Page>
      <Label>{t("Your collection", "你的料理收藏")}</Label>
      <Heading>{t("Cook it again.", "好吃，再煮一次。")}</Heading>
      {selected ? (
        <>
          <Button
            quiet
            title={t("Back to collection", "回到收藏列表")}
            onPress={() => setSelected(null)}
          />
          <RecipeCard
            key={JSON.stringify([selected.title, selected.ingredients])}
            recipe={selected}
            onChange={setSelected}
            go={go}
          />
        </>
      ) : (
        <>
          {!(st.data.recipes || []).length && (
            <Empty
              text={t(
                "Save a measured recipe from the Plan page to begin your collection.",
                "在規劃頁收藏食譜，建立你的料理清單。",
              )}
            />
          )}
          {(st.data.recipes || []).map((row: any) => (
            <Card key={row.id}>
              <Text style={s.title}>{row.title}</Text>
              <Copy>
                {row.minutes} {t("min", "分鐘")} · {row.servings}{" "}
                {t("servings", "份")}
              </Copy>
              <Button
                quiet
                title={t("Open recipe", "開啟食譜")}
                onPress={() =>
                  setSelected({
                    ...row.recipe,
                    usda_nutrition:
                      row.recipe.usda_nutrition || row.nutrition?.usda,
                    saved_recipe_id: row.id,
                  })
                }
              />
              <Button
                quiet
                title={t("Remove saved recipe", "移除收藏")}
                onPress={() =>
                  Alert.alert(t("Remove recipe?", "移除食譜？"), row.title, [
                    { text: t("Cancel", "取消"), style: "cancel" },
                    {
                      text: t("Remove", "移除"),
                      style: "destructive",
                      onPress: () =>
                        st.run(() =>
                          st.mutate("recipes", {}, "delete", row.id),
                        ),
                    },
                  ])
                }
              />
            </Card>
          ))}
          {(st.data.saved_meal_cards || []).map((idea: any) => (
            <Card key={idea.id}>
              <Label>{t("Saved idea", "料理靈感")}</Label>
              <Text style={s.title}>{idea.title}</Text>
              <Copy>
                {idea.uses?.join(", ")}
                {"\n"}
                {idea.why}
              </Copy>
              <Button
                quiet
                title={t("Remove idea", "移除靈感")}
                onPress={() =>
                  st.run(async () => {
                    requireOK(
                      await supabase
                        .from("saved_meal_cards")
                        .delete()
                        .eq("id", idea.id)
                        .eq("app_user_id", st.userId),
                    );
                    await st.refresh();
                  })
                }
              />
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
