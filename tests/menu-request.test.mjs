import assert from "node:assert/strict";
import test from "node:test";
import { parseMenuRequest } from "../supabase/functions/_shared/menu-request.js";

test("parses explicit menu separators without dish-name knowledge", () => {
  for (const request of [
    "宮保雞丁、排骨蛋炒飯、炒高麗菜",
    "宮保雞丁，排骨蛋炒飯，炒高麗菜",
    "宮保雞丁, 排骨蛋炒飯, 炒高麗菜",
    "宮保雞丁；排骨蛋炒飯；炒高麗菜",
    "宮保雞丁\n排骨蛋炒飯\n炒高麗菜",
    "宮保雞丁＋排骨蛋炒飯+炒高麗菜",
  ]) {
    assert.deepEqual(parseMenuRequest(request), {
      kind: "menu",
      originalRequest: request.normalize("NFKC"),
      dishes: ["宮保雞丁", "排骨蛋炒飯", "炒高麗菜"],
    });
  }
});

test("keeps conjunction-based dish names single", () => {
  for (const request of [
    "mac and cheese",
    "fish and chips",
    "牛肉與青椒炒飯",
  ]) {
    assert.deepEqual(parseMenuRequest(request), {
      kind: "single",
      originalRequest: request,
      dishes: [request],
    });
  }
});

test("normalizes, removes empty entries, and deduplicates", () => {
  assert.deepEqual(parseMenuRequest("  麻婆豆腐、、麻婆豆腐；炒高麗菜；  "), {
    kind: "menu",
    originalRequest: "麻婆豆腐、、麻婆豆腐;炒高麗菜;",
    dishes: ["麻婆豆腐", "炒高麗菜"],
  });
});

test("rejects oversized menus and oversized items", () => {
  assert.equal(
    parseMenuRequest("一、二、三、四、五、六、七").code,
    "menu_too_large",
  );
  assert.equal(
    parseMenuRequest(`${"菜".repeat(161)}、麻婆豆腐`).code,
    "invalid_menu_item",
  );
});
