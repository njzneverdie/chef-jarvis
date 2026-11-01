import assert from "node:assert/strict";
import test from "node:test";
import {
  languageMismatchPaths,
  textMatchesLanguage,
} from "../supabase/functions/_shared/recipe-language.js";

const zhPlan = (overrides = {}) => ({
  title: "韓式辣醬牛腹肉",
  summary: "香辣下飯的牛肉料理。",
  ingredients: [
    { name: "牛腹肉", usda_query: "beef flank steak raw", preparation: "逆紋切片" },
    { name: "蒜瓣", usda_query: "garlic raw", preparation: "切末" },
  ],
  steps: [
    { instruction: "將牛腹肉與 2 瓣蒜末、2 湯匙韓式辣椒醬拌勻，醃 15 分鐘。", timers: [{ label: "醃漬", kind: "marinate", duration_seconds: 900 }] },
  ],
  substitutions: [],
  equipment_adaptations: [],
  reuse_ideas: [],
  ...overrides,
});

test("zh-TW recipes flag any Latin text from the reported screenshot", () => {
  for (const text of ["flank steak", "2 瓣 minced garlic", "5g fine grated ginger", "2 tbsp gochujang", "30ml water", "Marination interval"]) {
    assert.equal(textMatchesLanguage(text, "zh-TW"), false, text);
  }
  assert.equal(textMatchesLanguage("烤箱預熱至 200°C，烤 20 分鐘。", "zh-TW"), true);
  assert.equal(textMatchesLanguage("加入 30 毫升水", "zh-TW"), true);
  assert.equal(textMatchesLanguage("Jarvis 準備了備用餐點", "zh-TW"), true);
  assert.equal(textMatchesLanguage("AI 暫時無法使用", "zh-TW"), false);
  assert.deepEqual(languageMismatchPaths(zhPlan(), "zh-TW"), []);
  const mixed = zhPlan({
    steps: [{ instruction: "將 flank steak 與 2 瓣 minced garlic 拌勻，醃 15 分鐘。", timers: [{ label: "Marination interval", kind: "marinate", duration_seconds: 900 }] }],
  });
  assert.deepEqual(languageMismatchPaths(mixed, "zh-TW"), [
    ["steps", 0, "instruction"],
    ["steps", 0, "timers", 0, "label"],
  ]);
  // usda_query stays English by contract and is never flagged.
  assert.ok(!languageMismatchPaths(mixed, "zh-TW").some((path) => path.includes("usda_query")));
});

test("English recipes flag any CJK text", () => {
  assert.equal(textMatchesLanguage("Marinate the flank steak for 15 minutes.", "en"), true);
  assert.equal(textMatchesLanguage("Add 2 tbsp 韓式辣椒醬", "en"), false);
  assert.equal(textMatchesLanguage("Add 2 tbsp gochujang (고추장)", "en"), false);
  const plan = zhPlan({ title: "Gochujang flank steak", summary: "Spicy beef.", ingredients: [{ name: "Flank steak", usda_query: "beef flank", preparation: "切片" }], steps: [] });
  assert.deepEqual(languageMismatchPaths(plan, "en"), [["ingredients", 0, "preparation"]]);
});

test("a named dish title may keep its required canonical label", () => {
  const plan = { ...zhPlan(), title: "香草燉豆腐 (Herb-braised tofu)", summary: "Tofu braised with herbs.", ingredients: [], steps: [] };
  assert.deepEqual(languageMismatchPaths(plan, "en", ["香草燉豆腐"]), []);
  assert.deepEqual(languageMismatchPaths(plan, "en"), [["title"]]);
});

test("selection fallback templates are single-language in both languages", async () => {
  const { selectionFallbackPlan } = await import("../supabase/functions/_shared/selection-fallback.js");
  const profile = { allergies: [], dietary_preferences: [], dislikes: [] };
  for (const language of ["zh-TW", "en"]) {
    for (const servings of [1, 2, 3, 4, 6]) {
      const plan = selectionFallbackPlan({ servings, max_minutes: 15 }, profile, language, []);
      assert.ok(plan);
      assert.deepEqual(languageMismatchPaths(plan, language), [], `${language} ${servings}`);
    }
  }
});
