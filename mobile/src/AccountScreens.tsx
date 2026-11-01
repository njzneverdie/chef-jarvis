import React, { useState } from "react";
import { Alert, Linking, Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Button, Card, Copy, Field, Heading, Label, Page, s, useT } from "./ui";
import { useStore, domain } from "./store";
import { supabase, emailAuth, requireOK } from "./client";
import type { Row } from "./types";
export function AuthScreen() {
  const t = useT(),
    st = useStore();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [message, setMessage] = useState("");
  const validEmail = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      throw new Error(t("Enter a valid email.", "請輸入有效電子郵件。"));
  };
  return (
    <Page>
      <Label>
        {t("A little planning. Better cooking.", "把料理，變成生活。")}
      </Label>
      <Heading>
        {t("Your kitchen,\nwith a little help.", "你的廚房，\n多一位好幫手。")}
      </Heading>
      <Copy>
        {t(
          "Meals that fit your goals, groceries you can use, and a calmer way to cook.",
          "從飲食目標到購物清單，一起把每一餐煮好。",
        )}
      </Copy>
      <Card>
        <Text style={s.title}>
          {signup
            ? t("Create your account", "建立帳號")
            : t("Welcome back", "歡迎回來")}
        </Text>
        <Field
          label={t("Email", "電子郵件")}
          value={email}
          onChange={setEmail}
        />
        <Field
          label={t("Password · at least 8 characters", "密碼・至少 8 個字元")}
          value={password}
          onChange={setPassword}
          secure
        />
        <Button
          disabled={st.busy}
          title={signup ? t("Create account", "註冊") : t("Sign in", "登入")}
          onPress={() =>
            st.run(async () => {
              validEmail();
              if (password.length < 8)
                throw new Error(
                  t("Use at least 8 characters.", "密碼至少需要 8 個字元。"),
                );
              if (signup) {
                requireOK(
                  await emailAuth.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {
                      emailRedirectTo: "https://chef-jarvis.pages.dev",
                    },
                  }),
                );
                setMessage(
                  t(
                    "Check your email to confirm, then sign in here.",
                    "請至信箱確認帳號，再回到這裡登入。",
                  ),
                );
              } else
                requireOK(
                  await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                  }),
                );
            })
          }
        />
        <Button
          quiet
          title={
            signup
              ? t("Already have an account? Sign in", "已有帳號？登入")
              : t("New here? Create an account", "還沒有帳號？註冊")
          }
          onPress={() => setSignup(!signup)}
        />
        <Button
          quiet
          title={t("Forgot password", "忘記密碼")}
          onPress={() =>
            st.run(async () => {
              validEmail();
              requireOK(
                await emailAuth.auth.resetPasswordForEmail(email.trim(), {
                  redirectTo: "https://chef-jarvis.pages.dev",
                }),
              );
              setMessage(
                t(
                  "If this account exists, a reset link is on its way. Finish the reset on the website, then sign in here.",
                  "若帳號存在，系統會寄出重設連結。請在網站完成重設，再回 App 登入。",
                ),
              );
            })
          }
        />
        {!!message && <Copy>{message}</Copy>}
      </Card>
      <Button
        quiet
        title={t("Privacy & data policy", "隱私與資料政策")}
        onPress={() =>
          Linking.openURL("https://chef-jarvis.pages.dev/privacy.html")
        }
      />
      <Copy>
        {t(
          "Recipe generation sends your request and food profile to our AI service. Nutrition is an estimate; always check allergen labels.",
          "產生食譜時，你的需求與飲食設定會傳送至 AI 服務。營養數值為估算；過敏者仍須確認食材標示。",
        )}
      </Copy>
    </Page>
  );
}
type T = (en: string, zh: string) => string;
export const allergyOptions = (t: T): [string, string][] => [
  ["Milk", t("Milk", "牛奶")],
  ["Egg", t("Egg", "蛋")],
  ["Peanut", t("Peanut", "花生")],
  ["Tree nuts", t("Tree nuts", "堅果")],
  ["Shellfish", t("Shellfish", "甲殼類")],
  ["Fish", t("Fish", "魚")],
  ["Soy", t("Soy", "大豆")],
  ["Wheat", t("Wheat", "小麥")],
  ["Sesame", t("Sesame", "芝麻")],
];
export const equipmentOptions = (t: T): [string, string][] => [
  ["Stovetop", t("Stovetop", "爐具")],
  ["Frying pan", t("Frying pan", "平底鍋")],
  ["Wok", t("Wok", "炒鍋")],
  ["Pot", t("Pot", "湯鍋")],
  ["Oven", t("Oven", "烤箱")],
  ["Microwave", t("Microwave", "微波爐")],
  ["Air fryer", t("Air fryer", "氣炸鍋")],
  ["Rice cooker", t("Rice cooker", "電鍋")],
  ["Steamer", t("Steamer", "蒸籠")],
];
export const skillOptions = (t: T): [string, string][] =>
  domain.cookingSkillOptions.map(([value, en, zh]: string[]) => [value, t(en, zh)]);

export function ProfileScreen() {
  const st = useStore(),
    t = useT();
  const p = st.profile || {};
  const [draft, setDraft] = useState<Row>({
    ...p,
    mode: p.mode || "calculated",
    height_cm: String(p.height_cm || ""),
    weight_kg: String(p.weight_kg || ""),
    age: String(p.age || ""),
    biological_sex: p.biological_sex || "female",
    activity_level: p.activity_level || "moderate",
    body_composition_goal: p.body_composition_goal || "maintain",
  });
  const [allergies, setAllergies] = useState((p.allergies || []).join(", ")),
    [diet, setDiet] = useState((p.dietary_preferences || []).join(", ")),
    [dislikes, setDislikes] = useState((p.dislikes || []).join(", ")),
    [equipment, setEquipment] = useState((p.equipment || []).join(", ")),
    [skill, setSkill] = useState<string>(st.cookingSkill || ""),
    [newPassword, setNewPassword] = useState(""),
    [deleteText, setDeleteText] = useState("");
  const update = (key: string, value: any) =>
    setDraft({ ...draft, [key]: value });
  const parts = (str: string) => [
    ...new Set(
      str
        .split(/[,，、]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
  async function save() {
    const { height_cm: h, weight_kg: w, age: a } = draft;
    if (!(
      Number(h) >= 100 &&
      Number(h) <= 250 &&
      Number(w) >= 30 &&
      Number(w) <= 300 &&
      Number(a) >= 18 &&
      Number(a) <= 100
    ))
      throw new Error(
        t(
          "Enter height 100–250 cm, weight 30–300 kg and age 18–100.",
          "請輸入身高 100–250 公分、體重 30–300 公斤、年齡 18–100 歲。",
        ),
      );
    const targets = domain.calculateTarget({
      mode: draft.mode,
      height: h,
      weight: w,
      age: a,
      sex: draft.biological_sex,
      activity: draft.activity_level,
      goal: draft.body_composition_goal,
      kcal: draft.calorie_target,
      protein: draft.protein_g,
      carbs: draft.carbs_g,
      fat: draft.fat_g,
    });
    const payload = {
      app_user_id: st.userId,
      mode: draft.mode,
      height_cm: Number(h),
      weight_kg: Number(w),
      age: Number(a),
      biological_sex: draft.biological_sex,
      activity_level: draft.activity_level,
      goal: draft.body_composition_goal,
      body_composition_goal: draft.body_composition_goal,
      calorie_target: targets.kcal,
      protein_g: targets.protein,
      carbs_g: targets.carbs,
      fat_g: targets.fat,
      onboarding_completed: true,
      allergies: parts(allergies),
      dietary_preferences: parts(diet),
      dislikes: parts(dislikes),
      equipment: parts(equipment),
      ...(skill ? { cooking_skill: skill } : {}),
    };
    await st.saveProfile(payload);
    Alert.alert(t("Profile saved", "設定已儲存"));
  }
  async function exportData() {
    const uid = st.userId;
    const names = [
      "app_profiles",
      "pantry_items",
      "recipes",
      "shopping_lists",
      "meal_plans",
      "nutrition_logs",
      "cooking_sessions",
      "recipe_feedback",
      "saved_meal_cards",
    ];
    const exported = await st.scoped(async () => {
      const rows = await Promise.all(
        names.map((n) =>
          supabase
            .from(n)
            .select("*")
            .eq(
              n === "app_profiles" || n === "saved_meal_cards"
                ? "app_user_id"
                : "user_id",
              uid,
            ),
        ),
      );
      rows.forEach(requireOK);
      const lists = rows[3].data || [],
        plans = rows[4].data || [];
      const [items, slots] = await Promise.all([
        lists.length
          ? supabase
              .from("shopping_list_items")
              .select("*")
              .in(
                "shopping_list_id",
                lists.map((x) => x.id),
              )
          : Promise.resolve({ data: [], error: null }),
        plans.length
          ? supabase
              .from("meal_plan_items")
              .select("*")
              .in(
                "meal_plan_id",
                plans.map((x) => x.id),
              )
          : Promise.resolve({ data: [], error: null }),
      ]);
      requireOK(items);
      requireOK(slots);
      return {
        exported_at: new Date().toISOString(),
        ...Object.fromEntries(names.map((n, i) => [n, rows[i].data])),
        shopping_list_items: items.data,
        meal_plan_items: slots.data,
      };
    });
    const file = new File(Paths.cache, "chef-jarvis-export.json");
    file.write(JSON.stringify(exported, null, 2));
    try {
      await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
    } finally {
      if (file.exists) file.delete();
    }
  }
  return (
    <Page>
      <Label>{t("Your food profile", "你的飲食設定")}</Label>
      <Heading>{t("Made for you.", "為你而煮。")}</Heading>
      <Copy>{st.session?.user.email}</Copy>
      <Card>
        <Text style={s.title}>
          {t("Daily nutrition targets", "每日營養目標")}
        </Text>
        <Choice
          label={t("Target mode", "目標計算方式")}
          value={draft.mode}
          options={[
            ["calculated", t("Calculate", "自動計算")],
            ["custom", t("Custom", "自訂")],
          ]}
          onChange={(v) => update("mode", v)}
        />
        {[
          ["height_cm", t("Height (cm)", "身高（公分）")],
          ["weight_kg", t("Weight (kg)", "體重（公斤）")],
          ["age", t("Age", "年齡")],
        ].map(([k, l]) => (
          <Field
            key={k}
            label={l}
            value={String(draft[k] || "")}
            onChange={(v) => update(k, v)}
            numeric
          />
        ))}
        <Choice
          label={t("Biological sex for calculation", "計算用生理性別")}
          value={draft.biological_sex}
          options={[
            ["female", t("Female", "女性")],
            ["male", t("Male", "男性")],
          ]}
          onChange={(v) => update("biological_sex", v)}
        />
        <Choice
          label={t("Activity", "活動量")}
          value={draft.activity_level}
          options={[
            ["low", t("Low", "低")],
            ["moderate", t("Moderate", "中")],
            ["high", t("High", "高")],
          ]}
          onChange={(v) => update("activity_level", v)}
        />
        <Choice
          label={t("Goal", "目標")}
          value={draft.body_composition_goal}
          options={[
            ["maintain", t("Maintain", "維持")],
            ["fat_loss", t("Fat loss", "減脂")],
            ["muscle_gain", t("Muscle gain", "增肌")],
            ["recomposition", t("Recomposition", "體態重組")],
          ]}
          onChange={(v) => update("body_composition_goal", v)}
        />
        {draft.mode === "custom" &&
          [
            ["calorie_target", t("Calories", "熱量")],
            ["protein_g", t("Protein (g)", "蛋白質（克）")],
            ["carbs_g", t("Carbs (g)", "碳水（克）")],
            ["fat_g", t("Fat (g)", "脂肪（克）")],
          ].map(([k, l]) => (
            <Field
              key={k}
              label={l}
              value={String(draft[k] ?? "")}
              onChange={(v) => update(k, v)}
              numeric
            />
          ))}
      </Card>
      <Card>
        <Text style={s.title}>{t("Food & kitchen", "飲食與廚房")}</Text>
        <MultiChoice
          label={t("Allergies", "過敏原")}
          value={allergies}
          onChange={setAllergies}
          options={allergyOptions(t)}
        />
        <MultiChoice
          label={t("Dietary needs", "飲食需求")}
          value={diet}
          onChange={setDiet}
          options={[
            ["Vegetarian", t("Vegetarian", "蛋奶素")],
            ["Vegan", t("Vegan", "純素")],
            ["Halal", t("Halal", "清真")],
            ["Gluten-free", t("Gluten-free", "無麩質")],
            ["Lactose-free", t("Lactose-free", "無乳糖")],
          ]}
        />
        <MultiChoice
          label={t("Disliked ingredients", "不喜歡的食材")}
          value={dislikes}
          onChange={setDislikes}
          options={[
            ["Cilantro", t("Cilantro", "香菜")],
            ["Onion", t("Onion", "洋蔥")],
            ["Garlic", t("Garlic", "蒜")],
            ["Mushroom", t("Mushroom", "菇類")],
            ["Eggplant", t("Eggplant", "茄子")],
            ["Tomato", t("Tomato", "番茄")],
          ]}
        />
        <MultiChoice
          label={t("Equipment", "廚房器材")}
          value={equipment}
          onChange={setEquipment}
          options={equipmentOptions(t)}
        />
        <Choice
          label={t("Cooking skill", "料理經驗")}
          value={skill}
          options={skillOptions(t)}
          onChange={setSkill}
        />
        <Button
          disabled={st.busy}
          title={t("Save profile", "儲存設定")}
          onPress={() => st.run(save)}
        />
      </Card>
      <Card>
        <Text style={s.title}>
          {t("Your account, your data", "你的帳號，你的資料")}
        </Text>
        <Button
          quiet
          title={t("Export all account data", "匯出所有帳號資料")}
          disabled={st.busy}
          onPress={() => st.run(exportData)}
        />
        <Button
          quiet
          title={t("Privacy policy", "隱私政策")}
          onPress={() =>
            Linking.openURL("https://chef-jarvis.pages.dev/privacy.html")
          }
        />
        <Field
          secure
          label={t("New password", "新密碼")}
          value={newPassword}
          onChange={setNewPassword}
        />
        <Button
          quiet
          disabled={st.busy}
          title={t("Update password", "更新密碼")}
          onPress={() =>
            st.run(async () => {
              if (newPassword.length < 8)
                throw new Error(
                  t("Use at least 8 characters.", "密碼至少需要 8 個字元。"),
                );
              requireOK(
                await supabase.auth.updateUser({ password: newPassword }),
              );
              setNewPassword("");
              Alert.alert(t("Password updated", "密碼已更新"));
            })
          }
        />
        <Button
          quiet
          title={t("Sign out", "登出")}
          onPress={() =>
            Alert.alert(
              t("Sign out?", "登出？"),
              t(
                "Local cooking progress and alarms will be cleared.",
                "本機烹飪進度與通知將清除。",
              ),
              [
                { text: t("Cancel", "取消"), style: "cancel" },
                {
                  text: t("Sign out", "登出"),
                  onPress: () => st.run(st.signOut),
                },
              ],
            )
          }
        />
        <Copy>
          {t(
            "Account deletion permanently removes your cloud data. Type DELETE to enable the final confirmation.",
            "刪除帳號會永久移除雲端資料。輸入 DELETE 後可進行最後確認。",
          )}
        </Copy>
        <Field label="DELETE" value={deleteText} onChange={setDeleteText} />
        <Button
          title={t("Delete my account", "刪除我的帳號")}
          disabled={st.busy || deleteText !== "DELETE"}
          onPress={() =>
            Alert.alert(
              t("Permanently delete?", "永久刪除？"),
              t("This cannot be undone.", "這項操作無法復原。"),
              [
                { text: t("Cancel", "取消"), style: "cancel" },
                {
                  text: t("Delete", "刪除"),
                  style: "destructive",
                  onPress: () =>
                    st.run(async () => {
                      await st.edge("chef-delete-account", {
                        confirmation: "DELETE",
                      });
                      requireOK(
                        await supabase.auth.signOut({ scope: "local" }),
                      );
                    }),
                },
              ],
            )
          }
        />
      </Card>
    </Page>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (s: string) => void;
}) {
  return (
    <View style={{ gap: 9 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.row}>
        {options.map(([v, l]) => (
          <Button
            key={v}
            quiet={value !== v}
            title={l}
            onPress={() => onChange(v)}
          />
        ))}
      </View>
    </View>
  );
}

export function MultiChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false),
    [custom, setCustom] = useState("");
  const selected = value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const allOptions = [
    ...options,
    ...selected
      .filter(
        (item) =>
          !options.some(([key]) => key.toLowerCase() === item.toLowerCase()),
      )
      .map((item) => [item, item]),
  ];
  return (
    <View style={{ gap: 9 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.row}>
        {allOptions.map(([key, text]) => {
          const checked = selected.some(
            (item) => item.toLowerCase() === key.toLowerCase(),
          );
          return (
            <Pressable
              key={key}
              accessibilityRole="checkbox"
              accessibilityLabel={text}
              accessibilityState={{ checked }}
              onPress={() =>
                onChange(
                  (checked
                    ? selected.filter(
                        (item) => item.toLowerCase() !== key.toLowerCase(),
                      )
                    : [...selected, key]
                  ).join(", "),
                )
              }
              style={[s.button, !checked && s.quiet]}
            >
              <Text style={[s.buttonText, !checked && { color: "#254C39" }]}>
                {checked ? "✓ " : ""}
                {text}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        quiet
        title={
          adding
            ? t("Cancel additional item", "取消新增其他項目")
            : t("Add an unlisted item (optional)", "新增清單外的項目（選填）")
        }
        onPress={() => setAdding((value) => !value)}
      />
      {adding && (
        <>
          <Copy>
            {t(
              "Use this only for something missing from the choices, such as a specific allergy.",
              "只有選項未列出的特殊過敏原或其他項目，才需要額外新增。",
            )}
          </Copy>
          <Field
            label={t("Additional item", "其他項目")}
            value={custom}
            onChange={setCustom}
          />
          <Button
            title={t("Add item", "加入選項")}
            disabled={!custom.trim()}
            onPress={() => {
              onChange(
                [
                  ...new Set([
                    ...selected,
                    ...custom
                      .split(/[,，、]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  ]),
                ].join(", "),
              );
              setCustom("");
              setAdding(false);
            }}
          />
        </>
      )}
    </View>
  );
}
