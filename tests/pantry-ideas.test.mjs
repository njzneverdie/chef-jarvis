import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackPantryIdeas,
  parsePantryIdeaChoice,
  safePantryForIdeas,
  validatePantryIdeas,
} from "../supabase/functions/_shared/pantry-ideas.js";

const profile = { allergies: ["peanut"], dislikes: ["cilantro"], dietary_preferences: [] };
const rows = [
  { name: "雞胸肉", expires_on: "2026-11-02" },
  { name: "高麗菜", expires_on: "2026-11-10" },
  { name: "雞蛋", expires_on: null },
  { name: "花生", expires_on: "2026-11-01" },
  { name: "Cilantro", expires_on: "2026-11-01" },
  { name: "雞胸肉", expires_on: "2026-11-05" },
];
const today = "2026-11-01";

test("only safe, de-duplicated pantry rows are offered, soonest expiry first", () => {
  const pantry = safePantryForIdeas(rows, profile, today);
  assert.deepEqual(pantry.map((item) => item.name), ["雞胸肉", "高麗菜", "雞蛋"]);
  assert.deepEqual(pantry.map((item) => item.expiring), [true, false, false]);
});

test("model ideas are validated against the server pantry, restrictions and language", () => {
  const pantry = safePantryForIdeas(rows, profile, today);
  const ideas = validatePantryIdeas({
    ideas: [
      { title: "高麗菜炒蛋", reason: "簡單快炒。", uses: ["高麗菜", "雞蛋"], missing: ["鹽"], minutes: 15 },
      { title: "雞胸肉高麗菜湯", reason: "先用掉快到期的雞胸肉。", uses: ["雞胸肉", "高麗菜"], missing: [], minutes: 25 },
      { title: "花生雞丁", reason: "香脆下飯。", uses: ["雞胸肉"], missing: ["花生"], minutes: 20 },
      { title: "Chicken salad", reason: "Light.", uses: ["雞胸肉"], missing: [], minutes: 10 },
      { title: "牛排", reason: "豪華。", uses: ["牛排"], missing: [], minutes: 20 },
      { title: "雞蛋湯", reason: "暖胃。", uses: ["雞蛋"], missing: ["a", "b", "c", "d"], minutes: 10 },
      { title: "蛋餅", reason: "早餐。", uses: ["雞蛋"], missing: [], minutes: 2 },
    ],
  }, { pantry, profile, language: "zh-TW" });
  assert.deepEqual(ideas.map((idea) => idea.title), ["雞胸肉高麗菜湯", "高麗菜炒蛋"]);
  assert.deepEqual(ideas[0].expiring, ["雞胸肉"]);
  assert.deepEqual(ideas[1].uses, ["高麗菜", "雞蛋"]);
});

test("pantry names in another language do not break the one-language check", () => {
  const pantry = safePantryForIdeas([{ name: "Greek yogurt", expires_on: null }], { allergies: [], dislikes: [], dietary_preferences: [] }, today);
  const ideas = validatePantryIdeas({
    ideas: [{ title: "Greek yogurt 水果杯", reason: "把 Greek yogurt 配水果。", uses: ["greek yogurt"], missing: ["水果"], minutes: 5 }],
  }, { pantry, profile: { allergies: [], dislikes: [], dietary_preferences: [] }, language: "zh-TW" });
  assert.equal(ideas.length, 1);
  assert.deepEqual(ideas[0].uses, ["Greek yogurt"]);
});

test("deterministic fallback ideas are safe and single-language", () => {
  const pantry = safePantryForIdeas(rows, profile, today);
  for (const language of ["zh-TW", "en"]) {
    const ideas = fallbackPantryIdeas(pantry, profile, language);
    assert.ok(ideas.length >= 2);
    for (const idea of ideas) {
      assert.ok(idea.uses.every((name) => pantry.some((item) => item.name === name)));
      assert.ok(!idea.uses.includes("花生"));
      assert.equal(validatePantryIdeas({ ideas: [idea] }, { pantry, profile, language }).length, 1, `${language} ${idea.title}`);
    }
  }
  assert.deepEqual(fallbackPantryIdeas([], profile, "zh-TW"), []);
});

test("a chosen idea is parsed strictly", () => {
  assert.deepEqual(parsePantryIdeaChoice({ title: "高麗菜炒蛋", uses: ["高麗菜", "雞蛋"] }), { title: "高麗菜炒蛋", uses: ["高麗菜", "雞蛋"] });
  assert.equal(parsePantryIdeaChoice(undefined), null);
  assert.throws(() => parsePantryIdeaChoice({ title: "", uses: ["x"] }), /Invalid/);
  assert.throws(() => parsePantryIdeaChoice({ title: "x", uses: "x" }), /Invalid/);
  assert.throws(() => parsePantryIdeaChoice({ title: "x", uses: [1] }), /Invalid/);
});
