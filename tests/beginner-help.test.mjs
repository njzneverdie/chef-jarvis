import assert from "node:assert/strict";
import test from "node:test";

await import("../public/domain.js");
const D = globalThis.ChefDomain;

test("cooking terms are tappable in each language without overlaps", () => {
  const zh = D.stepSegments("熱鍋後以中小火爆香蒜末，汆燙青江菜 1 分鐘，最後勾芡收汁 2 分鐘。", [], "zh-TW");
  assert.deepEqual(zh.filter((item) => item.kind === "term").map((item) => item.text), ["中小火", "爆香", "汆燙", "勾芡", "收汁"]);
  assert.equal(zh.map((item) => item.text).join(""), "熱鍋後以中小火爆香蒜末，汆燙青江菜 1 分鐘，最後勾芡收汁 2 分鐘。");
  const en = D.stepSegments("Sauté the minced garlic over medium heat, blanch the greens, then simmer.", [], "en");
  assert.deepEqual(en.filter((item) => item.kind === "term").map((item) => item.text), ["Sauté", "minced", "medium heat", "blanch", "simmer"]);
  assert.ok(en.every((item) => item.kind === "text" || /^[\x00-\x7f]*$/.test(item.help)));
  assert.ok(zh.every((item) => item.kind === "text" || D.textMatchesLanguage(item.help, "zh-TW")));
});

test("spoon and cup measures explain ml, grams by ingredient and a household measure", () => {
  const ingredients = [{ name: "醬油", usda_query: "soy sauce" }, { name: "橄欖油", usda_query: "olive oil" }];
  const segments = D.stepSegments("加入 2 湯匙醬油與 1 茶匙橄欖油，再加 1 杯水。", ingredients, "zh-TW").filter((item) => item.kind === "measure");
  assert.deepEqual(segments.map((item) => item.text), ["2 湯匙", "1 茶匙", "1 杯"]);
  assert.match(segments[0].help, /^約 30 毫升，醬油約 30 克。沒有量匙時/);
  assert.match(segments[1].help, /橄欖油約 4\.6 克/);
  assert.match(segments[2].help, /^約 240 毫升。沒有量杯時/);
  assert.match(D.measureHelp(1, "tbsp", "en"), /^About 15 ml\. Without measuring spoons/);
  assert.equal(D.measureHelp(100, "g", "en"), "");
});

test("recipe badges prefer valid AI values and otherwise derive from steps", () => {
  const steps = [{ instruction: "用平底鍋煎雞肉 5 分鐘。" }, { instruction: "湯鍋煮麵 8 分鐘。" }, { instruction: "放進烤箱烤 10 分鐘。" }];
  assert.deepEqual(D.recipeBadges({ steps }), { difficulty: 2, pots: 3, cleanup: "high" });
  assert.deepEqual(D.recipeBadges({ steps, difficulty: 1, pots_used: 1, cleanup: "low" }), { difficulty: 1, pots: 1, cleanup: "low" });
  assert.deepEqual(D.recipeBadges({ steps, difficulty: 9, pots_used: 0, cleanup: "none" }), { difficulty: 2, pots: 3, cleanup: "high" });
  assert.equal(D.recipeBadgeText({ steps: [{ instruction: "拌勻即可。" }] }, "zh-TW"), "難度 ★☆☆ · 用 1 個鍋具 · 洗碗量少");
  assert.equal(D.recipeBadgeText({ steps: [{ instruction: "Mix and serve." }] }, "en"), "Difficulty ★☆☆ · 1 pan · light cleanup");
});

test("prep checklist lists cutting work and tools before cooking", () => {
  const recipe = { ingredients: [{ name: "雞胸肉", preparation: "切丁" }, { name: "鹽", preparation: "無需處理" }], steps: [{ instruction: "平底鍋中火煎 5 分鐘。" }] };
  assert.deepEqual(D.prepChecklist(recipe, "zh-TW").map((item) => item.text), ["雞胸肉：切丁", "準備砧板與菜刀", "準備平底鍋"]);
  assert.deepEqual(D.prepChecklist({ ...recipe, equipment_needed: ["炒鍋"] }, "zh-TW").map((item) => item.text), ["雞胸肉：切丁", "準備砧板與菜刀", "準備炒鍋"]);
  assert.ok(D.genericRescueTips("zh-TW").every(([problem, fix]) => D.textMatchesLanguage(problem + fix, "zh-TW")));
  assert.ok(D.genericRescueTips("en").every(([problem, fix]) => D.textMatchesLanguage(problem + fix, "en")));
});

test("quick feedback tags map to ratings and drive the cooked-dishes list", () => {
  assert.equal(D.feedbackRatingForTags([]), null);
  assert.equal(D.feedbackRatingForTags(["delicious"]), 5);
  assert.equal(D.feedbackRatingForTags(["too_salty"]), 3);
  const logs = [
    { recipe_title: "番茄炒蛋", eaten_on: "2026-10-01" },
    { recipe_title: "番茄炒蛋", eaten_on: "2026-10-20" },
    { recipe_title: "紅燒肉", eaten_on: "2026-10-25" },
    { recipe_title: "蒸蛋", eaten_on: "2026-10-10" },
  ];
  const feedback = [
    { recipe_title: "紅燒肉", tags: ["too_hard"], created_at: "2026-10-25T10:00:00Z" },
    { recipe_title: "蒸蛋", tags: ["too_hard"], created_at: "2026-10-01T10:00:00Z" },
    { recipe_title: "蒸蛋", tags: ["delicious"], created_at: "2026-10-10T10:00:00Z" },
  ];
  const dishes = D.cookedDishes(logs, feedback, [{ title: "番茄炒蛋", id: "r1" }]);
  assert.deepEqual(dishes.map((dish) => [dish.title, dish.count, dish.last, dish.recipe?.id ?? null]), [
    ["番茄炒蛋", 2, "2026-10-20", "r1"],
    ["蒸蛋", 1, "2026-10-10", null],
  ]);
});

test("normalized steps keep short doneness and rescue hints only", () => {
  const [step] = D.normalizeRecipeSteps([{ instruction: "炒 3 分鐘。", timers: [], doneness: "邊緣微焦", rescue: "x".repeat(300) }]);
  assert.deepEqual(step, { instruction: "炒 3 分鐘。", timers: [], doneness: "邊緣微焦" });
});
