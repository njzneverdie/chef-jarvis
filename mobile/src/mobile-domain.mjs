import "./shared-domain.js";
export function remainingSeconds(timer, now = Date.now()) {
  if (timer.mode === "stopwatch")
    return timer.deadline == null
      ? timer.remaining
      : Math.max(
          0,
          timer.remaining + Math.floor((now - timer.deadline) / 1000),
        );
  return timer.deadline == null
    ? Math.max(0, timer.remaining)
    : Math.max(0, Math.ceil((timer.deadline - now) / 1000));
}
export function toggleDeadline(timer, now = Date.now()) {
  if (timer.mode === "stopwatch")
    return timer.deadline == null
      ? { ...timer, deadline: now }
      : { ...timer, remaining: remainingSeconds(timer, now), deadline: null };
  return timer.deadline == null
    ? { ...timer, deadline: now + Math.max(0, timer.remaining) * 1000 }
    : { ...timer, remaining: remainingSeconds(timer, now), deadline: null };
}
export function persistableCooking(state) {
  return !state || state.recipe?.source_persistence === "session_only"
    ? null
    : state;
}
export function validateMeasuredRecipe(recipe) {
  if (!globalThis.ChefDomain.recipeIntegrityReport(recipe).safe) return false;
  return (
    Array.isArray(recipe?.ingredients) &&
    recipe.ingredients.length > 0 &&
    recipe.ingredients.every(
      (i) =>
        i &&
        typeof i === "object" &&
        String(i.name || "").trim() &&
        Number.isFinite(i.quantity) &&
        i.quantity > 0 &&
        String(i.unit || "").trim(),
    ) &&
    Array.isArray(recipe.steps) &&
    recipe.steps.length > 0 &&
    recipe.steps.every(
      (s) => typeof s.instruction === "string" && s.instruction.trim(),
    )
  );
}
export function applyRecipeSwap(
  recipe,
  sub,
  apply = (item, s) => ({
    ...item,
    name: s.to,
    quantity: s.quantity,
    unit: s.unit,
  }),
) {
  return {
    ...recipe,
    nutrition_stale: true,
    saved_recipe_id: undefined,
    usda_nutrition: undefined,
    ingredients: recipe.ingredients.map((i) =>
      i.name === sub.from ? apply(i, sub) : i,
    ),
    steps: recipe.steps.map((step, index) => {
      const update = (sub.step_updates || []).find(
        (u) => u.step_index === index,
      );
      return update
        ? { instruction: update.instruction, timers: update.timers || [] }
        : step;
    }),
    substitutions: [],
  };
}
export function recipeNutrition(recipe) {
  if (globalThis.ChefDomain.hasCompleteUsdaNutrition(recipe.usda_nutrition))
    return recipe.usda_nutrition;
  return recipe.nutrition_stale ? null : recipe;
}
export async function scheduleMeal(
  { plan, createPlan, saveSlot, loadSlots },
  slot,
) {
  const target = plan || (await createPlan());
  await saveSlot({ ...slot, meal_plan_id: target.id });
  return await loadSlots(target.id);
}

export function resetKitchenTimer(timer) {
  if (
    timer.mode !== "stopwatch" &&
    !(Number.isFinite(timer.duration) && timer.duration > 0)
  )
    throw new Error(
      "Original timer duration is unavailable; recreate this older timer.",
    );
  return {
    ...timer,
    remaining: timer.mode === "stopwatch" ? 0 : timer.duration,
    deadline: null,
  };
}
export function validateMealCompletion(servings, rating) {
  const amount = Number(servings);
  if (!Number.isFinite(amount) || amount < 0.25 || amount > 12)
    throw new Error("Choose between 0.25 and 12 servings.");
  if (
    rating !== "" &&
    (!Number.isInteger(Number(rating)) ||
      Number(rating) < 1 ||
      Number(rating) > 5)
  )
    throw new Error("Choose a rating from 1 to 5, or skip it.");
  return { amount, rating: rating === "" ? null : Number(rating) };
}

// Backend, auth and network errors arrive in English; show them in the
// interface language. Unknown English errors in Chinese mode get a generic
// Chinese message instead of mixed text.
const errorTranslations = [
  [/invalid login credentials/i, "Email or password is incorrect.", "電子郵件或密碼不正確。"],
  [/email not confirmed/i, "Confirm your email first, then sign in.", "請先到信箱確認帳號，再登入。"],
  [/user already registered|already been registered/i, "This email is already registered. Sign in instead.", "這個電子郵件已註冊，請直接登入。"],
  [/password should be at least|weak password/i, "Use a longer, stronger password.", "密碼太短或太簡單，請換一個。"],
  [/rate limit|too many requests|429/i, "Too many attempts. Wait a minute and try again.", "嘗試太多次，請等一分鐘再試。"],
  [/jwt expired|session.*(expired|missing)|refresh token|please sign in again/i, "Your sign-in expired. Please sign in again.", "登入已過期，請重新登入。"],
  [/network request failed|failed to fetch|network|timed? ?out|abort/i, "Network problem. Check your connection and try again.", "網路連線有問題，請確認連線後再試。"],
  [/permission denied|row-level security|not authorized|forbidden/i, "This action is not allowed for your account.", "你的帳號沒有權限執行這個動作。"],
];

export function localizeErrorMessage(message, language) {
  const text = String(message || "").trim();
  const zh = language === "zh-TW";
  const match = errorTranslations.find(([pattern]) => pattern.test(text));
  if (match) return zh ? match[2] : match[1];
  if (!text) return zh ? "發生問題，請再試一次。" : "Something went wrong. Please try again.";
  const hasCjk = /[㐀-鿿]/.test(text);
  if (zh && !hasCjk) return "發生問題，請再試一次。";
  if (!zh && hasCjk) return "Something went wrong. Please try again.";
  return text;
}

// Where bought items go in the pantry, with a conservative default expiry.
export function pantryDefaultsForCategory(category, today = new Date()) {
  const days = { protein: 2, dairy: 7, produce: 5 }[category];
  const zone = ["protein", "dairy", "produce"].includes(category) ? "fridge" : "pantry";
  return { storage_zone: zone, expires_on: days ? expiryAfterDays(days, today) : null };
}

export function expiryAfterDays(days, today = new Date()) {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// chefjarvis://import?url=<link> (from the share extension or a shortcut)
// carries a video link to the import screen; any other URL returns null.
export function importLinkFromURL(url) {
  try {
    const parsed = new URL(url);
    const target = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, "");
    if (parsed.protocol !== "chefjarvis:" || target !== "import") return null;
    return findVideoLink(parsed.searchParams.get("url") || "")?.url || null;
  } catch {
    return null;
  }
}

// Finds the first YouTube or Instagram link in pasted or shared text, which
// often carries extra words around the link.
export function findVideoLink(text) {
  const candidates = String(text || "").match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be|instagram\.com)\/[^\s"'<>]+/gi) || [];
  for (const candidate of candidates) {
    try {
      const url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
      const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
      const platform = host === "instagram.com" ? "instagram" : "youtube";
      return { platform, url: url.toString() };
    } catch {}
  }
  return null;
}

// The import screen shows the YouTube or Instagram Reels form. A pasted link
// decides it; until then the user's choice (or the screen it was opened as) does.
export function importSource(chosen, text) {
  return findVideoLink(text)?.platform || (chosen === "instagram" ? "instagram" : "youtube");
}

export const VIDEO_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_UPLOAD_MAX_MS = 300 * 1000;

// Picked videos must fit the private upload bucket and the 5-minute cap.
export function videoUploadProblem(asset, language) {
  const zh = language === "zh-TW";
  if (!asset || asset.type !== "video")
    return zh ? "請選擇一支影片。" : "Choose a video.";
  if (Number(asset.duration) > VIDEO_UPLOAD_MAX_MS)
    return zh ? "影片最長 5 分鐘。" : "Videos can be up to 5 minutes long.";
  if (Number(asset.fileSize) > VIDEO_UPLOAD_MAX_BYTES)
    return zh ? "影片檔案太大，請先剪短再選。" : "Videos can be up to 50 MB. Trim it and try again.";
  return "";
}
