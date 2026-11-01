import React, { useEffect, useState, useRef } from "react";
import { Alert, Text, View } from "react-native";
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
import { useStore, domain } from "./store";
import { supabase, requireOK } from "./client";
import { Choice } from "./AccountScreens";
import { PantryIdeas } from "./PantryIdeas";
import { scheduleMeal, validateMeasuredRecipe } from "./mobile-domain.mjs";
const zoneLabels: Record<string, [string, string]> = {
  fridge: ["Fridge", "冷藏"],
  freezer: ["Freezer", "冷凍"],
  pantry: ["Pantry", "常溫"],
};
const mealLabels: Record<string, [string, string]> = {
  breakfast: ["Breakfast", "早餐"],
  lunch: ["Lunch", "午餐"],
  dinner: ["Dinner", "晚餐"],
  snack: ["Snack", "點心"],
};
const labelFor = (
  labels: Record<string, [string, string]>,
  key: string,
  t: (en: string, zh: string) => string,
) => (labels[key] ? t(...labels[key]) : key || "");
export function PantryScreen({ go }: { go: (tab: string) => void }) {
  const st = useStore(),
    t = useT();
  const [name, setName] = useState(""),
    [quantity, setQuantity] = useState(""),
    [unit, setUnit] = useState("g"),
    [zone, setZone] = useState("fridge"),
    [expires, setExpires] = useState(""),
    [edit, setEdit] = useState<string | undefined>(),
    [batch, setBatch] = useState<
      { name: string; quantity: number; unit: string }[] | null
    >(null);
  function checkExpiry() {
    if (
      expires &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(expires) ||
        !Number.isFinite(Date.parse(expires)))
    )
      throw new Error(
        t("Use YYYY-MM-DD for expiry.", "效期請使用 YYYY-MM-DD。"),
      );
  }
  function resetForm() {
    setName("");
    setQuantity("");
    setExpires("");
    setEdit(undefined);
    setBatch(null);
  }
  async function save() {
    // Several items separated by 、 , ; / or new lines go through a preview.
    const entries = edit
      ? []
      : domain.parsePantryEntries(name, { quantity, unit });
    if (entries.length > 1) {
      checkExpiry();
      setBatch(entries);
      return;
    }
    if (entries.length === 1 && entries[0].explicit) {
      checkExpiry();
      await st.mutate("pantry_items", {
        user_id: st.userId,
        app_user_id: st.userId,
        name: entries[0].name,
        quantity: entries[0].quantity,
        unit: entries[0].unit,
        storage_zone: zone,
        expires_on: expires || null,
        source: "manual",
      });
      resetForm();
      return;
    }
    if (
      !name.trim() ||
      !Number.isFinite(Number(quantity)) ||
      Number(quantity) <= 0 ||
      !unit.trim()
    )
      throw new Error(
        t(
          "Enter a name, positive quantity and unit.",
          "請填寫食材名稱、正數份量與單位。",
        ),
      );
    checkExpiry();
    const payload = {
      user_id: st.userId,
      app_user_id: st.userId,
      name: name.trim(),
      quantity: Number(quantity),
      unit: unit.trim(),
      storage_zone: zone,
      expires_on: expires || null,
      ...(edit ? {} : { source: "manual" }),
    };
    await st.mutate("pantry_items", payload, edit ? "update" : "insert", edit);
    resetForm();
  }
  // One insert call for the whole batch: all rows are saved or none.
  async function saveBatch() {
    if (!batch?.length) return;
    await st.mutate(
      "pantry_items",
      batch.map((entry) => ({
        user_id: st.userId,
        app_user_id: st.userId,
        name: entry.name,
        quantity: entry.quantity,
        unit: entry.unit,
        storage_zone: zone,
        expires_on: expires || null,
        source: "manual",
      })) as any,
    );
    resetForm();
  }
  return (
    <Page>
      <Label>{t("Your kitchen inventory", "你的廚房庫存")}</Label>
      <Heading>{t("Use what you have.", "從現有食材開始。")}</Heading>
      {!!(st.data.pantry_items || []).length && <PantryIdeas go={go} />}
      <Card>
        <Text style={s.title}>
          {edit
            ? t("Edit ingredient", "編輯食材")
            : t("Add an ingredient", "新增食材")}
        </Text>
        <Field
          label={
            edit
              ? t("Ingredient", "食材名稱")
              : t(
                  "Ingredient (add several with commas, e.g. fish 300g, eggs 6)",
                  "食材名稱（可一次輸入多項，用、或逗號分開，例如：鯛魚 300克、蛋 6顆）",
                )
          }
          value={name}
          onChange={(value: string) => {
            setName(value);
            setBatch(null);
          }}
        />
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Field
              label={t("Quantity", "份量")}
              value={quantity}
              onChange={setQuantity}
              numeric
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("Unit", "單位")} value={unit} onChange={setUnit} />
          </View>
        </View>
        <Choice
          label={t("Storage", "存放區域")}
          value={zone}
          options={[
            ["fridge", t("Fridge", "冷藏")],
            ["freezer", t("Freezer", "冷凍")],
            ["pantry", t("Pantry", "常溫")],
          ]}
          onChange={setZone}
        />
        <Field
          label={t("Expiry (optional, YYYY-MM-DD)", "效期（選填，YYYY-MM-DD）")}
          value={expires}
          onChange={setExpires}
        />
        {batch ? (
          <View style={{ gap: 9 }}>
            <Text style={s.fieldLabel}>
              {t(`Add ${batch.length} items:`, `將新增 ${batch.length} 項：`)}
            </Text>
            <Copy>
              {batch
                .map(
                  (entry) =>
                    `${entry.name} ${entry.quantity} ${domain.unitLabel(entry.unit, st.lang, entry.quantity)}`,
                )
                .join(t(", ", "、"))}
            </Copy>
            <Button
              disabled={st.busy}
              title={t(`Add all ${batch.length}`, `確認新增 ${batch.length} 項`)}
              onPress={() => st.run(saveBatch)}
            />
            <Button
              quiet
              title={t("Back to edit", "返回修改")}
              onPress={() => setBatch(null)}
            />
          </View>
        ) : (
          <Button
            disabled={st.busy}
            title={t("Save ingredient", "儲存食材")}
            onPress={() => st.run(save)}
          />
        )}
        {edit && (
          <Button
            quiet
            title={t("Cancel edit", "取消編輯")}
            onPress={() => {
              setEdit(undefined);
              setName("");
              setQuantity("");
              setExpires("");
            }}
          />
        )}
      </Card>
      {!(st.data.pantry_items || []).length && (
        <Empty
          text={t(
            "Your pantry is empty. Add the ingredients you have at home.",
            "食材庫尚無資料，先加入家中現有的食材。",
          )}
        />
      )}
      {(st.data.pantry_items || []).map((item: any) => (
        <Card key={item.id}>
          <Text style={s.title}>{item.name}</Text>
          <Copy>
            {item.quantity} {domain.unitLabel(item.unit, st.lang, item.quantity)} · {labelFor(zoneLabels, item.storage_zone, t)}
            {item.expires_on ? ` · ${item.expires_on}` : ""}
          </Copy>
          <View style={s.row}>
            <Button
              quiet
              title={t("Edit", "編輯")}
              onPress={() => {
                setEdit(item.id);
                setName(item.name);
                setQuantity(String(item.quantity || ""));
                setUnit(item.unit || "g");
                setZone(item.storage_zone || "fridge");
                setExpires(item.expires_on || "");
              }}
            />
            <Button
              quiet
              title={t("Remove", "移除")}
              onPress={() =>
                Alert.alert(t("Remove ingredient?", "移除食材？"), item.name, [
                  { text: t("Cancel", "取消"), style: "cancel" },
                  {
                    text: t("Remove", "移除"),
                    style: "destructive",
                    onPress: () =>
                      st.run(() =>
                        st.mutate("pantry_items", {}, "delete", item.id),
                      ),
                  },
                ])
              }
            />
          </View>
        </Card>
      ))}
    </Page>
  );
}
export function ShoppingScreen() {
  const st = useStore(),
    t = useT();
  const [items, setItems] = useState<any[]>([]);
  async function load() {
    const ids = (st.data.shopping_lists || []).map((l: any) => l.id);
    const result = ids.length
      ? await st.scoped(() =>
          supabase
            .from("shopping_list_items")
            .select("*")
            .in("shopping_list_id", ids)
            .order("created_at"),
        )
      : { data: [], error: null };
    requireOK(result);
    setItems(result.data || []);
  }
  useEffect(() => {
    void st.run(load);
  }, [st.data.shopping_lists]);
  async function toggle(item: any) {
    await st.scoped(async () =>
      requireOK(
        await supabase
          .from("shopping_list_items")
          .update({ is_checked: !item.is_checked })
          .eq("id", item.id)
          .eq("shopping_list_id", item.shopping_list_id),
      ),
    );
    await load();
  }
  return (
    <Page>
      <Label>{t("Shop with a plan", "有計畫地採買")}</Label>
      <Heading>{t("A shorter shopping trip.", "把採買，變簡單。")}</Heading>
      {!(st.data.shopping_lists || []).length && (
        <Empty
          text={t(
            "Create a grocery list from a recipe or your weekly plan.",
            "從食譜或本週菜單建立購物清單。",
          )}
        />
      )}
      {(st.data.shopping_lists || []).map((list: any) => (
        <Card key={list.id}>
          <Text style={s.title}>{list.title}</Text>
          {!!list.created_at && (
            <Copy>
              {t("Created ", "建立於 ")}
              {new Date(list.created_at).toLocaleDateString(
                st.lang === "zh-TW" ? "zh-TW" : "en-US",
              )}
            </Copy>
          )}
          {items.some(
            (i) =>
              i.shopping_list_id === list.id &&
              !domain.textMatchesLanguage(i.ingredient, st.lang),
          ) && (
            <Copy>
              {t(
                "This list was created in another language, so item names stay as saved. Delete it and create a new list from a new recipe to switch.",
                "這份清單是用其他語言建立的舊資料，食材名稱維持當時的內容。要改成中文，請刪除後從新產生的食譜重新建立。",
              )}
            </Copy>
          )}
          {items
            .filter((i) => i.shopping_list_id === list.id)
            .map((item) => (
              <Button
                quiet
                key={item.id}
                disabled={st.busy}
                title={`${item.is_checked ? "✓" : "○"}  ${item.quantity ?? ""} ${domain.unitLabel(item.unit, st.lang, item.quantity)} · ${item.ingredient}${item.pantry_item_id ? t(" · in pantry", "・已入庫") : ""}`}
                onPress={() => st.run(() => toggle(item))}
              />
            ))}
          <Button
            quiet
            title={t("Move checked items to pantry", "已購食材加入庫存")}
            disabled={
              st.busy ||
              !items.some(
                (i) =>
                  i.shopping_list_id === list.id &&
                  i.is_checked &&
                  !i.pantry_item_id,
              )
            }
            onPress={() =>
              st.run(async () => {
                const checked = items.filter(
                  (i) =>
                    i.shopping_list_id === list.id &&
                    i.is_checked &&
                    !i.pantry_item_id,
                );
                if (checked.some((i) => !(Number(i.quantity) > 0) || !i.unit))
                  throw new Error(
                    t(
                      "This legacy list needs exact quantities first.",
                      "此舊清單需要先補齊份量與單位。",
                    ),
                  );
                // Retain each row until both writes succeed; the pantry reference prevents duplication after retries.
                for (const item of checked) {
                  if (item.pantry_item_id) continue;
                  await st.scoped(async () => {
                    const pantry = requireOK(
                      await supabase.from("pantry_items").upsert(
                        {
                          id: item.id,
                          user_id: st.userId,
                          app_user_id: st.userId,
                          name: item.ingredient,
                          quantity: Number(item.quantity),
                          unit: item.unit,
                          storage_zone: "pantry",
                          source: "shopping_list",
                        },
                        { onConflict: "id", ignoreDuplicates: true },
                      ),
                    );
                    requireOK(
                      await supabase
                        .from("shopping_list_items")
                        .update({ pantry_item_id: item.id })
                        .eq("id", item.id)
                        .eq("shopping_list_id", list.id),
                    );
                  });
                }
                await st.refresh();
                await load();
                Alert.alert(t("Added to pantry", "已加入食材庫"));
              })
            }
          />
          <Button
            quiet
            title={t("Delete list", "刪除清單")}
            onPress={() =>
              Alert.alert(t("Delete list?", "刪除清單？"), list.title, [
                { text: t("Cancel", "取消"), style: "cancel" },
                {
                  text: t("Delete", "刪除"),
                  style: "destructive",
                  onPress: () =>
                    st.run(() =>
                      st.mutate("shopping_lists", {}, "delete", list.id),
                    ),
                },
              ])
            }
          />
        </Card>
      ))}
    </Page>
  );
}
export function WeekScreen() {
  const st = useStore(),
    t = useT();
  const [date, setDate] = useState(domain.localDateKey(new Date())),
    [meal, setMeal] = useState("dinner"),
    [servings, setServings] = useState("2"),
    [selected, setSelected] = useState(""),
    [slots, setSlots] = useState<any[]>([]);
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const week = domain.localDateKey(start);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return domain.localDateKey(d);
  });
  const plan = (st.data.meal_plans || []).find(
    (p: any) => p.week_start === week,
  );
  const slotRevision = useRef(0);
  async function load(id = plan?.id) {
    const revision = ++slotRevision.current;
    if (!id) {
      setSlots([]);
      return [];
    }
    const result = await st.scoped(() =>
      supabase
        .from("meal_plan_items")
        .select("*")
        .eq("meal_plan_id", id)
        .order("scheduled_for"),
    );
    requireOK(result);
    const rows = result.data || [];
    if (revision === slotRevision.current) setSlots(rows);
    return rows;
  }
  useEffect(() => {
    void st.run(load);
  }, [plan?.id]);
  async function schedule() {
    if (!days.includes(date))
      throw new Error(t("Choose a date in this week.", "請選擇本週日期。"));
    if (
      !selected ||
      !Number.isInteger(Number(servings)) ||
      Number(servings) < 1 ||
      Number(servings) > 20
    )
      throw new Error(
        t("Choose a recipe and 1–20 servings.", "請選擇食譜並輸入 1–20 份。"),
      );
    await scheduleMeal(
      {
        plan,
        createPlan: async () => {
          const rows = await st.mutate("meal_plans", {
            user_id: st.userId,
            app_user_id: st.userId,
            week_start: week,
          });
          return rows[0];
        },
        saveSlot: (payload: any) =>
          st.scoped(async () =>
            requireOK(
              await supabase.from("meal_plan_items").upsert(payload, {
                onConflict: "meal_plan_id,scheduled_for,meal_type",
              }),
            ),
          ),
        loadSlots: load,
      },
      {
        recipe_id: selected,
        scheduled_for: date,
        meal_type: meal,
        servings: Number(servings),
      },
    );
    await st.refresh();
  }

  async function groceries() {
    const ingredients = slots.flatMap((slot) => {
      const row = (st.data.recipes || []).find(
        (r: any) => r.id === slot.recipe_id,
      );
      if (!row || !validateMeasuredRecipe(row.recipe))
        throw new Error(
          t(
            "A scheduled recipe is missing exact measurements.",
            "菜單內有食譜缺少完整份量。",
          ),
        );
      return domain.scaleIngredientsForServings(
        row.recipe.ingredients,
        slot.servings,
        row.recipe.servings,
      );
    });
    if (!ingredients.length)
      throw new Error(t("Schedule a meal first.", "請先安排餐點。"));
    const merged = domain.mergeGroceryItems(ingredients);
    await st.scoped(async () => {
      const list = requireOK(
        await supabase
          .from("shopping_lists")
          .insert({
            user_id: st.userId,
            app_user_id: st.userId,
            title: `${t("Week of", "本週")} ${week}`,
          })
          .select()
          .single(),
      ).data;
      const result = await supabase.from("shopping_list_items").insert(
        merged.map((i: any) => ({
          shopping_list_id: list.id,
          ingredient: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category || "other",
        })),
      );
      if (result.error) {
        await supabase
          .from("shopping_lists")
          .delete()
          .eq("id", list.id)
          .eq("user_id", st.userId);
        throw result.error;
      }
    });
    await st.refresh();
    Alert.alert(t("Weekly grocery list created", "已建立本週購物清單"));
  }
  return (
    <Page>
      <Label>{t("A week with less guesswork", "一週料理，先想好")}</Label>
      <Heading>
        {t("Make room for good food.", "把好好吃飯，\n排進生活。")}
      </Heading>
      <Copy>
        {days[0]} — {days[6]}
      </Copy>
      <Card>
        <Choice
          label={t("Day", "日期")}
          value={date}
          options={days.map((d) => [d, d.slice(5)])}
          onChange={setDate}
        />
        <Choice
          label={t("Meal", "餐別")}
          value={meal}
          options={[
            ["breakfast", t("Breakfast", "早餐")],
            ["lunch", t("Lunch", "午餐")],
            ["dinner", t("Dinner", "晚餐")],
            ["snack", t("Snack", "點心")],
          ]}
          onChange={setMeal}
        />
        <Choice
          label={t("Servings", "份數")}
          value={servings}
          onChange={setServings}
          options={["1", "2", "3", "4", "6"].map((value) => [
            value,
            t(`${value} servings`, `${value} 人份`),
          ])}
        />
        <Label>{t("Choose a saved recipe", "選擇收藏食譜")}</Label>
        {(st.data.recipes || []).map((r: any) => (
          <Button
            quiet={selected !== r.id}
            key={r.id}
            title={r.title}
            onPress={() => setSelected(r.id)}
          />
        ))}
        <Button
          title={t("Schedule meal", "安排餐點")}
          disabled={st.busy || !selected}
          onPress={() => st.run(schedule)}
        />
      </Card>
      {!slots.length && (
        <Empty
          text={t(
            "Nothing scheduled yet. Add a saved recipe to your week.",
            "還沒有安排餐點，先加入一道收藏食譜。",
          )}
        />
      )}
      {slots.map((slot) => (
        <Card key={slot.id}>
          <Label>
            {slot.scheduled_for} · {labelFor(mealLabels, slot.meal_type, t)}
          </Label>
          <Text style={s.title}>
            {(st.data.recipes || []).find((r: any) => r.id === slot.recipe_id)
              ?.title || t("Recipe removed", "食譜已移除")}
          </Text>
          <Copy>
            {slot.servings} {t("servings", "份")}
          </Copy>
          <Button
            quiet
            title={t("Remove from week", "從菜單移除")}
            onPress={() =>
              st.run(async () => {
                await st.scoped(async () =>
                  requireOK(
                    await supabase
                      .from("meal_plan_items")
                      .delete()
                      .eq("id", slot.id)
                      .eq("meal_plan_id", plan.id),
                  ),
                );
                await load();
              })
            }
          />
        </Card>
      ))}
      <Button
        title={t("Make the weekly grocery list", "建立整週購物清單")}
        disabled={st.busy || !slots.length}
        onPress={() => st.run(groceries)}
      />
    </Page>
  );
}
export function NutritionScreen() {
  const st = useStore(),
    t = useT();
  const [title, setTitle] = useState(""),
    [kcal, setKcal] = useState(""),
    [protein, setProtein] = useState(""),
    [carbs, setCarbs] = useState(""),
    [fat, setFat] = useState("");
  async function save() {
    const nums = [kcal, protein, carbs, fat];
    if (
      !title.trim() ||
      nums.some(
        (v) => !v.trim() || !Number.isFinite(Number(v)) || Number(v) < 0,
      ) ||
      Number(kcal) > 10000 ||
      [protein, carbs, fat].some((v) => Number(v) > 2000)
    )
      throw new Error(
        t(
          "Enter a meal name and valid non-negative nutrition values.",
          "請輸入餐點名稱與有效的非負營養數值。",
        ),
      );
    await st.mutate("nutrition_logs", {
      user_id: st.userId,
      app_user_id: st.userId,
      recipe_title: title.trim(),
      eaten_on: domain.localDateKey(new Date()),
      calories: Number(kcal),
      protein_g: Number(protein),
      carbs_g: Number(carbs),
      fat_g: Number(fat),
      nutrition_source: "manual",
      servings_eaten: 1,
    });
    setTitle("");
    setKcal("");
    setProtein("");
    setCarbs("");
    setFat("");
  }
  return (
    <Page>
      <Label>{t("Your nutrition journal", "你的營養日誌")}</Label>
      <Heading>{t("Notice what nourishes you.", "每一餐，都有記錄。")}</Heading>
      <Card>
        <Text style={s.title}>{t("Quick meal log", "快速記錄餐點")}</Text>
        <Field
          label={t("Meal name", "餐點名稱")}
          value={title}
          onChange={setTitle}
        />
        {[
          [t("Calories", "大卡"), kcal, setKcal],
          [t("Protein (g)", "蛋白質（克）"), protein, setProtein],
          [t("Carbs (g)", "碳水（克）"), carbs, setCarbs],
          [t("Fat (g)", "脂肪（克）"), fat, setFat],
        ].map(([label, value, setter]: any) => (
          <Field
            key={label}
            label={label}
            value={value}
            onChange={setter}
            numeric
          />
        ))}
        <Button
          disabled={st.busy}
          title={t("Log meal", "記錄餐點")}
          onPress={() => st.run(save)}
        />
      </Card>
      {!(st.data.nutrition_logs || []).length && (
        <Empty
          text={t(
            "No meals logged yet. Completed cooking can also be logged here.",
            "尚未記錄餐點。完成烹飪後也可以新增記錄。",
          )}
        />
      )}
      {(st.data.nutrition_logs || []).map((n: any) => (
        <Card key={n.id}>
          <Label>{n.eaten_on}</Label>
          <Text style={s.title}>{n.recipe_title}</Text>
          <Copy>
            {Math.round(n.calories || 0)} kcal · P{" "}
            {Math.round(n.protein_g || 0)}g · C {Math.round(n.carbs_g || 0)}g ·
            F {Math.round(n.fat_g || 0)}g
          </Copy>
          <Button
            quiet
            title={t("Remove log", "刪除記錄")}
            onPress={() =>
              st.run(() => st.mutate("nutrition_logs", {}, "delete", n.id))
            }
          />
        </Card>
      ))}
    </Page>
  );
}
