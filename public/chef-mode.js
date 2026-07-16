// Meal planning, shopping, and Chef Mode live here. app.js owns auth and the shell.
let activeRecipe = null;
let activeRecipeId = null;
let currentPlan = null;
let cookingStepIndex = 0;
let chefEquipmentAdaptations = [];
let wakeLock = null;
let lastTimerTick = Date.now();
let titleFlashInterval = null;
let alarmAudioContext = null;
let recipeTimersInitialized = false;
let shoppingSavedNotice = false;
let planRenderVersion = 0;
let usdaRenderVersion = 0;
let speechRecognition = null;
let voiceListening = false;
let voicePausedForSpeech = false;
let speechSequence = 0;

const fallbackCookingSteps = [
  "Prepare and measure every ingredient before turning on the heat.",
  "Heat your pan over medium heat and add the cooking oil.",
  "Cook the protein until browned and safely cooked through.",
  "Add vegetables and sauce, then stir until evenly coated.",
  "Taste, adjust seasoning, plate, and serve while hot.",
];

function cookingStorageKey() {
  return user ? `chef-jarvis:cooking:${user.id}` : null;
}

function savedPlansCacheKey() {
  return user ? `chef-jarvis:saved-plans:${user.id}` : null;
}

function persistCookingState() {
  const key = cookingStorageKey();
  if (!key) return;
  localStorage.setItem(
    key,
    JSON.stringify({
      activeRecipe,
      activeRecipeId,
      cookingStepIndex,
      timers,
      recipeTimersInitialized,
      savedAt: Date.now(),
    }),
  );
}

function restoreCookingState() {
  const key = cookingStorageKey();
  if (!key) return;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved?.activeRecipe) return;
    activeRecipe = saved.activeRecipe;
    activeRecipeId =
      saved.activeRecipeId || saved.activeRecipe.saved_recipe_id || null;
    cookingStepIndex = Math.max(0, Number(saved.cookingStepIndex) || 0);
    timers = Array.isArray(saved.timers)
      ? saved.timers.map((timer) => ({
          ...timer,
          sec: Math.max(0, finiteNumber(timer.sec, 0)),
          duration: Math.max(0, finiteNumber(timer.duration, 0)),
          completed: Boolean(timer.completed),
          running: Boolean(timer.running),
        }))
      : [];
    recipeTimersInitialized = Boolean(saved.recipeTimersInitialized);
    if (!recipeTimersInitialized) {
      timers = timers.filter(
        (timer) => timer.source || !/^Step \d+:/i.test(timer.name || ""),
      );
      timers.push(...window.ChefDomain.buildRecipeTimers(activeRecipe.steps));
      recipeTimersInitialized = true;
    }
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - finiteNumber(saved.savedAt, Date.now())) / 1000),
    );
    timers.forEach((timer) => {
      if (!timer.running || elapsed === 0) return;
      if (timer.mode === "stopwatch") timer.sec += elapsed;
      else {
        timer.sec = Math.max(0, timer.sec - elapsed);
        if (timer.sec === 0) {
          timer.running = false;
          timer.completed = true;
        }
      }
    });
  } catch (error) {
    console.warn("Could not restore cooking progress", error);
    localStorage.removeItem(key);
  }
}

function clearCookingState() {
  const key = cookingStorageKey();
  if (key) localStorage.removeItem(key);
  activeRecipe = null;
  activeRecipeId = null;
  cookingStepIndex = 0;
  timers = [];
  recipeTimersInitialized = false;
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (error) {
    console.info("Screen Wake Lock is unavailable", error);
  }
}

async function releaseWakeLock() {
  if (!wakeLock) return;
  try {
    await wakeLock.release();
  } finally {
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    document.querySelector("#cook")?.classList.contains("active")
  )
    requestWakeLock();
});

function sayInstruction(text) {
  if (!("speechSynthesis" in window)) return toast(text);
  const sequence = ++speechSequence;
  const shouldResumeVoice = voiceListening && Boolean(speechRecognition);
  voicePausedForSpeech = shouldResumeVoice;
  if (shouldResumeVoice) {
    try {
      speechRecognition.stop();
    } catch {
      // Recognition may already be between sessions.
    }
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u3400-\u9fff]/.test(text)
    ? "zh-TW"
    : document.documentElement.lang || navigator.language || "en-US";
  const resumeRecognition = () => {
    if (sequence !== speechSequence) return;
    voicePausedForSpeech = false;
    if (!shouldResumeVoice || !voiceListening) return;
    try {
      speechRecognition.start();
    } catch {
      // Recognition may have resumed through the browser already.
    }
  };
  utterance.onend = resumeRecognition;
  utterance.onerror = resumeRecognition;
  window.speechSynthesis.speak(utterance);
}

function recipeFor(query = "High-protein tomato chicken pasta") {
  const diet =
    (profile?.dietary_preferences || []).join(", ") || "your preferences";
  return {
    title: query,
    summary: `Created for ${diet}; substitutions and nutrition reflect your profile.`,
    kcal: Math.min(finiteNumber(profile?.calorie_target, 650), 650),
    protein_g: Math.max(
      profile?.protein_g ? Math.round(profile.protein_g / 3) : 52,
      42,
    ),
    carbs_g: null,
    fat_g: null,
    minutes: 30,
    servings: 2,
    ingredients: [],
    steps: fallbackCookingSteps,
    substitutions: [],
    equipment_adaptations: [],
    reuse_ideas: [],
  };
}

function displayNumber(value, suffix = "") {
  const number = finiteNumber(value);
  return number == null ? "—" : `${Math.round(number * 10) / 10}${suffix}`;
}

function appLocale() {
  return window.I18n.code === "zh-TW" ? "zh-TW" : "en-US";
}

function displayDate(value) {
  return new Date(value).toLocaleDateString(appLocale());
}

function displayShoppingUnit(value, quantity) {
  const unit = String(value || "");
  if (window.I18n.code !== "zh-TW") {
    if (Number(quantity) === 1) return unit;
    return (
      {
        cup: "cups",
        piece: "pieces",
        clove: "cloves",
        slice: "slices",
        can: "cans",
        pack: "packs",
        portion: "portions",
      }[unit] || unit
    );
  }
  return (
    {
      tsp: "茶匙",
      tbsp: "湯匙",
      cup: "杯",
      cups: "杯",
      piece: "個",
      pieces: "個",
      portion: "份",
      portions: "份",
      clove: "瓣",
      cloves: "瓣",
      slice: "片",
      slices: "片",
      can: "罐",
      cans: "罐",
      pack: "包",
      packs: "包",
    }[unit] || unit
  );
}

function renderPlan(query) {
  const root = document.querySelector("#plan");
  if (!root) return;
  const renderVersion = ++planRenderVersion;
  const isAi = query && typeof query === "object";
  const recipe = isAi
    ? {
        title: String(query.title || "Chef Jarvis meal"),
        summary: String(query.summary || "Your meal plan is ready."),
        minutes: finiteNumber(query.minutes, 30),
        servings: finiteNumber(query.servings, 2),
        kcal: finiteNumber(query.kcal),
        protein_g: finiteNumber(query.protein_g),
        carbs_g: finiteNumber(query.carbs_g),
        fat_g: finiteNumber(query.fat_g),
        ingredients: Array.isArray(query.ingredients)
          ? query.ingredients.map(window.ChefDomain.normalizeIngredient)
          : [],
        steps:
          Array.isArray(query.steps) && query.steps.length
            ? query.steps
            : fallbackCookingSteps,
        substitutions: Array.isArray(query.substitutions)
          ? query.substitutions
          : [],
        equipment_adaptations: Array.isArray(query.equipment_adaptations)
          ? query.equipment_adaptations
          : [],
        reuse_ideas: Array.isArray(query.reuse_ideas) ? query.reuse_ideas : [],
        image: query.image || null,
        usda_nutrition: query.usda_nutrition || null,
        saved_recipe_id: query.saved_recipe_id || null,
        is_saved: Boolean(query.is_saved),
      }
    : recipeFor(typeof query === "string" ? query : undefined);
  recipe.steps = window.ChefDomain.normalizeRecipeSteps(recipe.steps);
  if (!recipe.steps.length) {
    recipe.steps = window.ChefDomain.normalizeRecipeSteps(fallbackCookingSteps);
  }
  const ingredients = recipe.ingredients.length
    ? recipe.ingredients
    : [
        {
          name: "Your selected ingredients",
          amount: "Check your shopping list",
        },
      ];
  const reuse = recipe.reuse_ideas.length
    ? recipe.reuse_ideas
    : [
        {
          title: "Save this meal for next week",
          uses: [],
          why: "Plan another meal around ingredients you already have.",
        },
      ];
  currentPlan = isAi ? { ...query, ...recipe } : null;
  activeRecipeId = recipe.saved_recipe_id || null;
  chefEquipmentAdaptations = recipe.equipment_adaptations;
  const imageUrl = window.ChefDomain.safeExternalUrl(recipe.image?.url, [
    "wikimedia.org",
  ]);
  const imageSourceUrl = window.ChefDomain.safeExternalUrl(
    recipe.image?.description_url,
    ["wikimedia.org"],
  );
  const recipeVisual = imageUrl
    ? `<div class="recipe-photo dish-visual has-recipe-image"><img class="recipe-image" src="${esc(imageUrl)}" alt="${esc(recipe.title)}" loading="lazy">${imageSourceUrl ? `<a class="recipe-image-credit" href="${esc(imageSourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(recipe.image.creator || "Wikimedia Commons")} · ${esc(recipe.image.license || "source")}</a>` : ""}</div>`
    : `<div class="recipe-photo dish-visual"><div><span>YOUR DISH</span><b>${esc(recipe.title)}</b><small>Ingredients and cooking steps below</small></div></div>`;
  root.innerHTML = `
    <div class="title"><div><p class="eyebrow">PERSONAL MEAL PLANNER</p><h1>${isAi ? "Your meal is" : "Let’s make something"}<br><em>${isAi ? "ready." : "great."}</em></h1></div><button class="dark" id="new-meal">＋ New meal</button></div>
    <div class="planner">
      <article class="chat"><div class="chat-head"><span>✦</span><div><b>Chef Jarvis</b><small>Pantry and profile applied</small></div></div><div class="chat-log"><div class="bubble user">${esc(isAi ? query.userRequest : query || "Tell Jarvis what you would like to cook.")}</div><div class="bubble ai">${esc(recipe.summary)}</div></div></article>
      <article class="recipe card">${recipeVisual}<div class="recipe-body"><p class="eyebrow">CHEF JARVIS PLAN</p><h2>${esc(recipe.title)}</h2><p class="meta">◷ ${displayNumber(recipe.minutes)} min · ◌ ${displayNumber(recipe.servings)} servings</p><div class="macros"><div><b>${displayNumber(recipe.kcal)}</b><small>est. kcal · whole meal</small></div><div><b>${displayNumber(recipe.protein_g, "g")}</b><small>est. protein · whole meal</small></div><div><b>${displayNumber(recipe.carbs_g, "g")}</b><small>est. carbs · whole meal</small></div><div><b>${displayNumber(recipe.fat_g, "g")}</b><small>est. fat · whole meal</small></div></div><p class="meal-estimate-note"><b>Meal estimate</b> · Whole recipe (${displayNumber(recipe.servings)} servings). Adjust it after changing quantities or swaps.</p><button class="dark full" id="start-guided-cook" ${isAi ? "" : "disabled"}>Start guided cooking →</button></div></article>
    </div>
    <div class="guided-preview"><article class="card ingredient-guide"><p class="eyebrow">WHAT TO PREPARE</p><h2>Ingredients for this meal</h2>${ingredients
      .map((item, index) => {
        const preparation = window.ChefDomain.ingredientPreparation(item);
        return `<div data-ingredient-index="${index}"><b>${esc(item.name)}</b><span>${esc(item.amount || "")}</span>${preparation ? `<small>${esc(preparation)}</small>` : ""}</div>`;
      })
      .join(
        "",
      )}</article><article class="card step-guide"><p class="eyebrow">HOW JARVIS WILL GUIDE YOU</p><h2>${recipe.steps.length} clear cooking steps</h2><ol>${recipe.steps.map((step) => `<li>${esc(step.instruction)}</li>`).join("")}</ol></article></div>
    <article class="reuse card"><p class="eyebrow">SHOP ONCE, COOK MORE</p><h2>Ideas using your remaining ingredients.</h2><div class="swipe-list">${reuse
      .slice(0, 3)
      .map(
        (item) =>
          `<article class="meal-card"><h3>${esc(item.title)}</h3><p>${esc(item.why || (item.uses || []).join(" · "))}</p><button class="save" data-save="${esc(item.title)}" data-uses="${esc((item.uses || []).join("|"))}">Save for week →</button></article>`,
      )
      .join("")}</div></article>`;

  document.querySelector("#new-meal").onclick = () => show("home");
  document.querySelector("#start-guided-cook").onclick = () => {
    activeRecipe = { ...recipe, ingredients, saved_recipe_id: activeRecipeId };
    cookingStepIndex = 0;
    timers = window.ChefDomain.buildRecipeTimers(recipe.steps);
    recipeTimersInitialized = true;
    persistCookingState();
    renderCook();
    show("cook");
  };
  document.querySelectorAll("[data-save]").forEach(
    (button) =>
      (button.onclick = async () => {
        await saveCard(
          button.dataset.save,
          button.dataset.uses.split("|").filter(Boolean),
          "Saved from your AI meal plan",
          recipe.title,
        );
        button.textContent = "Saved ✓";
        button.classList.add("saved");
      }),
  );

  if (!isAi) {
    renderSavedPlans(renderVersion);
    return;
  }
  renderPlanPersistenceControls(recipe);
  if (recipe.ingredients.length) {
    let shoppingChecklist;
    renderPersonalizedSwaps(recipe, async (ingredientIndex, swap) => {
      const replacement = window.ChefDomain.applyIngredientSubstitution(
        recipe.ingredients[ingredientIndex],
        swap,
      );
      recipe.ingredients[ingredientIndex] = replacement;
      ingredients[ingredientIndex] = replacement;
      if (currentPlan) currentPlan.ingredients = recipe.ingredients;

      const row = root.querySelector(
        `[data-ingredient-index="${ingredientIndex}"]`,
      );
      if (row) {
        const preparation =
          window.ChefDomain.ingredientPreparation(replacement);
        row.innerHTML = `<b>${esc(replacement.name)}</b><span>${esc(replacement.amount)}</span>${preparation ? `<small>${esc(preparation)}</small>` : ""}`;
      }
      shoppingChecklist?.updateIngredient(ingredientIndex, replacement);
      renderUsdaReference(recipe);

      const cookingWarning = root.querySelector(".swap-cooking-warning");
      if (cookingWarning) {
        cookingWarning.classList.remove("hidden");
        cookingWarning.textContent =
          "Ingredient and grocery quantities are updated. Cooking steps may still describe the original ingredient, so review them before starting—especially for allergies.";
      }

      if (activeRecipeId) {
        const { error } = await sb
          .from("recipes")
          .update({ recipe: currentPlan || recipe })
          .eq("id", activeRecipeId)
          .eq("user_id", user.id);
        if (error) {
          toast("The swap is applied here, but could not be saved yet.");
          return;
        }
      }
      toast(`${replacement.name} is now in your ingredient list ✓`);
    });
    shoppingChecklist = renderShoppingChecklist(
      recipe.title,
      recipe.ingredients,
    );
    renderUsdaReference(recipe);
  }
  if (query.fallback) {
    const notice = document.createElement("p");
    notice.className = "chef-fallback-note";
    notice.textContent =
      "Gemini is temporarily busy, so Jarvis prepared a fully measured fallback recipe.";
    root.querySelector(".planner").insertAdjacentElement("afterend", notice);
  }
  renderEquipmentAdaptations(recipe.equipment_adaptations);
}

function renderEquipmentAdaptations(adaptations) {
  if (!adaptations.length) return;
  const panel = document.createElement("article");
  panel.className = "reuse card chef-adaptations";
  panel.innerHTML = `<p class="eyebrow">DEVICE ALTERNATIVES</p><h2>Made for your kitchen setup.</h2><p>These swaps use the equipment saved in your profile.</p><div class="adaptation-grid">${adaptations
    .slice(0, 3)
    .map(
      (item) =>
        `<article><b>${esc(item.original)} → ${esc(item.alternative)}</b><p>${esc(item.instructions)}</p><small>${esc(item.why || "")}</small></article>`,
    )
    .join("")}</div>`;
  document.querySelector("#plan").append(panel);
}

function renderPlanPersistenceControls(recipe) {
  const title = document.querySelector("#plan .title");
  if (!title || !activeRecipeId) return;
  const controls = document.createElement("div");
  controls.className = "plan-persistence-controls";
  controls.innerHTML = recipe.is_saved
    ? "<span>Saved to your recipes ✓</span>"
    : '<span><b>Not saved yet</b><small>This draft can be restored for 30 minutes after a refresh.</small></span><button class="cream" id="cook-later">Cook later</button>';
  title.append(controls);
  const button = controls.querySelector("#cook-later");
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Saving…";
    const { error } = await sb
      .from("recipes")
      .update({ is_saved: true, updated_at: new Date().toISOString() })
      .eq("id", activeRecipeId)
      .eq("user_id", user.id);
    if (error) {
      button.disabled = false;
      button.textContent = "Cook later";
      return toast(error.message);
    }
    recipe.is_saved = true;
    if (currentPlan) currentPlan.is_saved = true;
    controls.innerHTML = "<span>Saved to your recipes ✓</span>";
    toast("Find this meal under Recent plans whenever you are ready to cook.");
  };
}

function planFromSavedRow(row) {
  const recipe = row.recipe || {};
  const estimate = row.nutrition?.estimate || row.nutrition || {};
  const usda = row.nutrition?.usda || recipe.usda_nutrition || null;
  return {
    ...recipe,
    title: row.title,
    minutes: row.minutes ?? recipe.minutes,
    servings: row.servings ?? recipe.servings ?? 2,
    kcal: usda?.kcal ?? estimate.kcal ?? recipe.kcal,
    protein_g: usda?.protein_g ?? estimate.protein_g ?? recipe.protein_g,
    carbs_g: usda?.carbs_g ?? estimate.carbs_g ?? recipe.carbs_g,
    fat_g: usda?.fat_g ?? estimate.fat_g ?? recipe.fat_g,
    usda_nutrition: usda,
    userRequest: recipe.userRequest || row.title,
    saved_recipe_id: row.id,
    is_saved: Boolean(row.is_saved),
  };
}

async function restoreRecentDraftPlan() {
  if (!user) return false;
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("recipes")
    .select("id,title,servings,minutes,recipe,nutrition,created_at,is_saved")
    .eq("user_id", user.id)
    .eq("is_saved", false)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Could not restore the recent meal-plan draft", error);
    return false;
  }
  if (!data) return false;
  renderPlan(planFromSavedRow(data));
  return true;
}

async function renderSavedPlans(expectedRenderVersion = planRenderVersion) {
  const root = document.querySelector("#plan");
  if (!root || !user) return;
  const { data: remoteData, error } = await sb
    .from("recipes")
    .select("id,title,servings,minutes,recipe,nutrition,created_at,is_saved")
    .eq("user_id", user.id)
    .eq("is_saved", true)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (
    expectedRenderVersion !== planRenderVersion ||
    root !== document.querySelector("#plan")
  )
    return;
  const cacheKey = savedPlansCacheKey();
  let data = remoteData;
  if (!error && data?.length && cacheKey) {
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } else if (error && cacheKey) {
    try {
      data = JSON.parse(localStorage.getItem(cacheKey) || "[]");
    } catch {
      data = [];
    }
  }
  if (!data?.length) return;
  const card = document.createElement("article");
  card.className = "card recent-plans";
  card.innerHTML = `<div><p class="eyebrow">YOUR SAVED COOKING PLANS</p><h2>Pick up where you left off.</h2><p>Only meals you chose to save appear here. You can remove experiments at any time.</p></div><div class="recent-plan-list">${data.map((row, index) => `<article data-saved-plan="${esc(row.id)}"><div><b>${esc(row.title)}</b><small>${window.I18n.code === "zh-TW" ? `${displayNumber(row.minutes)} 分鐘 · ${displayNumber(row.servings)} 人份 · 儲存於 ${esc(displayDate(row.created_at))}` : `${displayNumber(row.minutes, " min")} · ${displayNumber(row.servings, " servings")} · saved ${esc(displayDate(row.created_at))}`}</small></div><div class="recent-plan-actions"><button class="cream" data-delete-plan="${index}" aria-label="Delete recipe">Delete</button><button class="dark" data-resume-plan="${index}">Open plan →</button></div></article>`).join("")}</div>`;
  root.append(card);
  card
    .querySelectorAll("[data-resume-plan]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          renderPlan(
            planFromSavedRow(data[Number(button.dataset.resumePlan)]),
          )),
    );
  card.querySelectorAll("[data-delete-plan]").forEach(
    (button) =>
      (button.onclick = async () => {
        const row = data[Number(button.dataset.deletePlan)];
        const confirmed = await confirmAction({
          title: "Delete this saved recipe?",
          message: `“${row.title}” will be removed from Recent plans.`,
          confirmLabel: "Delete recipe",
        });
        if (!confirmed) return;
        const { error: deleteError } = await sb
          .from("recipes")
          .delete()
          .eq("id", row.id)
          .eq("user_id", user.id);
        if (deleteError) return toast(deleteError.message);
        button.closest("[data-saved-plan]")?.remove();
        if (!card.querySelector("[data-saved-plan]")) card.remove();
        toast("Saved recipe deleted");
      }),
  );
}

async function saveCard(title, uses, why, sourceRecipeTitle) {
  const payload = {
    app_user_id: user.id,
    title: String(title).slice(0, 160),
    uses,
    why,
    source_recipe_title: String(sourceRecipeTitle || "").slice(0, 160) || null,
    saved_for_week: true,
  };
  const { error } = await sb.from("saved_meal_cards").insert(payload);
  if (error) toast(error.message);
  else toast("Saved to next week’s meal folder ✓");
}

function dateKey(date) {
  const copy = new Date(date);
  const offset = copy.getTimezoneOffset() * 60000;
  return new Date(copy.getTime() - offset).toISOString().slice(0, 10);
}

function currentWeekStart() {
  const date = new Date();
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(12, 0, 0, 0);
  return date;
}

async function saveMergedShoppingList(title, ingredients) {
  const merged = window.ChefDomain.mergeGroceryItems(ingredients);
  if (!merged.length) throw new Error("Add meals before building the list.");
  const { data: list, error: listError } = await sb
    .from("shopping_lists")
    .insert({
      user_id: user.id,
      app_user_id: user.id,
      title: String(title).slice(0, 120),
      status: "active",
    })
    .select("id")
    .single();
  if (listError) throw listError;
  const { error } = await sb.from("shopping_list_items").insert(
    merged.map((item) => ({
      shopping_list_id: list.id,
      ingredient: item.name,
      quantity: item.quantity,
      unit: item.unit || null,
      category: item.category || "grocery",
      is_checked: false,
    })),
  );
  if (error) {
    await sb.from("shopping_lists").delete().eq("id", list.id);
    throw error;
  }
  return merged.length;
}

async function renderWeeklyPlanner() {
  const root = document.querySelector("#week");
  if (!root || !user) return;
  const weekStart = currentWeekStart();
  const weekStartKey = dateKey(weekStart);
  root.innerHTML = `<div class="title"><div><p class="eyebrow">WEEKLY PLANNER</p><h1>Shop once,<br><em>cook all week.</em></h1></div><button class="dark" id="build-week-list" disabled>Build weekly grocery list →</button></div><div class="weekly-grid"><article class="card weekly-loading"><p>Loading your week…</p></article></div>`;
  let { data: plan, error: planError } = await sb
    .from("meal_plans")
    .select("id,week_start")
    .eq("user_id", user.id)
    .eq("week_start", weekStartKey)
    .maybeSingle();
  if (!plan && !planError) {
    const result = await sb
      .from("meal_plans")
      .insert({
        user_id: user.id,
        app_user_id: user.id,
        week_start: weekStartKey,
        target: {
          kcal: profile?.calorie_target,
          protein_g: profile?.protein_g,
        },
      })
      .select("id,week_start")
      .single();
    plan = result.data;
    planError = result.error;
  }
  if (planError || !plan) {
    root.querySelector(".weekly-grid").innerHTML =
      `<article class="card weekly-loading"><h2>Could not load this week.</h2><p>${esc(planError?.message || "Try again shortly.")}</p></article>`;
    return;
  }
  const [{ data: items }, { data: recipes }, { data: ideas }] =
    await Promise.all([
      sb
        .from("meal_plan_items")
        .select("id,recipe_id,scheduled_for,meal_type,servings,notes")
        .eq("meal_plan_id", plan.id)
        .order("scheduled_for"),
      sb
        .from("recipes")
        .select("id,title,servings,recipe")
        .eq("user_id", user.id)
        .eq("is_saved", true)
        .order("updated_at", { ascending: false })
        .limit(30),
      sb
        .from("saved_meal_cards")
        .select("id,title,why")
        .eq("app_user_id", user.id)
        .eq("saved_for_week", true)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
  if (root !== document.querySelector("#week")) return;
  const recipeRows = recipes || [];
  const schedule = items || [];
  const recipeMap = new Map(recipeRows.map((recipe) => [recipe.id, recipe]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return { key: dateKey(date), date };
  });
  root.querySelector(".weekly-grid").innerHTML = days
    .map(({ key, date }) => {
      const scheduled = schedule.find((item) => item.scheduled_for === key);
      const scheduledRecipe = scheduled
        ? recipeMap.get(scheduled.recipe_id)
        : null;
      return `<article class="card week-day" data-week-day="${key}"><p class="eyebrow">${esc(date.toLocaleDateString(appLocale(), { weekday: "long" }))}</p><h2>${esc(date.toLocaleDateString(appLocale(), { month: "short", day: "numeric" }))}</h2>${scheduledRecipe ? `<div class="scheduled-meal"><b>${esc(scheduledRecipe.title)}</b><span>${displayNumber(scheduled.servings)} servings</span><button class="timer-remove" data-remove-week-item="${esc(scheduled.id)}" aria-label="Remove meal">×</button></div>` : '<p class="empty-slot">Dinner is open.</p>'}<div class="week-add"><select data-week-recipe><option value="">Choose a saved recipe</option>${recipeRows.map((recipe) => `<option value="${esc(recipe.id)}">${esc(recipe.title)}</option>`).join("")}</select><button class="cream" data-save-week-day="${key}">${scheduled ? "Replace" : "Add"}</button></div></article>`;
    })
    .join("");
  const listButton = root.querySelector("#build-week-list");
  listButton.disabled = !schedule.length;
  listButton.onclick = async () => {
    const scheduledRecipes = schedule
      .map((item) => recipeMap.get(item.recipe_id)?.recipe)
      .filter(Boolean);
    listButton.disabled = true;
    listButton.textContent = "Merging ingredients…";
    try {
      const count = await saveMergedShoppingList(
        `${window.I18n.code === "zh-TW" ? "本週購物" : "Weekly groceries"} · ${weekStartKey}`,
        scheduledRecipes.flatMap((recipe) => recipe.ingredients || []),
      );
      shoppingSavedNotice = true;
      toast(`${count} merged grocery items saved ✓`);
      show("shopping");
    } catch (error) {
      listButton.disabled = false;
      listButton.textContent = "Build weekly grocery list →";
      toast(error.message || "Could not build the weekly list.");
    }
  };
  root.querySelectorAll("[data-save-week-day]").forEach(
    (button) =>
      (button.onclick = async (event) => {
        const dayCard = event.currentTarget.closest("[data-week-day]");
        const recipeId = dayCard.querySelector("[data-week-recipe]").value;
        if (!recipeId) return toast("Choose a saved recipe first.");
        const existing = schedule.find(
          (item) => item.scheduled_for === dayCard.dataset.weekDay,
        );
        const selectedRecipe = recipeMap.get(recipeId);
        const payload = {
          meal_plan_id: plan.id,
          recipe_id: recipeId,
          scheduled_for: dayCard.dataset.weekDay,
          meal_type: "dinner",
          servings: finiteNumber(selectedRecipe?.servings, 2),
        };
        const query = existing
          ? sb.from("meal_plan_items").update(payload).eq("id", existing.id)
          : sb.from("meal_plan_items").insert(payload);
        const { error } = await query;
        if (error) return toast(error.message);
        toast("Meal added to your week ✓");
        renderWeeklyPlanner();
      }),
  );
  root.querySelectorAll("[data-remove-week-item]").forEach(
    (button) =>
      (button.onclick = async () => {
        const { error } = await sb
          .from("meal_plan_items")
          .delete()
          .eq("id", button.dataset.removeWeekItem);
        if (error) return toast(error.message);
        renderWeeklyPlanner();
      }),
  );
  if (ideas?.length) {
    const inspiration = document.createElement("article");
    inspiration.className = "card week-ideas";
    inspiration.innerHTML = `<p class="eyebrow">SAVED FOR NEXT WEEK</p><h2>Ideas waiting in your folder.</h2><div>${ideas.map((idea) => `<span><b>${esc(idea.title)}</b><small>${esc(idea.why || "Saved meal idea")}</small></span>`).join("")}</div>`;
    root.append(inspiration);
  }
}

function renderPersonalizedSwaps(recipe, onApply) {
  const dietary = profile?.dietary_preferences || [];
  const allergies = profile?.allergies || [];
  const dislikes = profile?.dislikes || [];
  const goal = profile?.body_composition_goal || "maintain";
  const has = (value) =>
    [...dietary, ...allergies, ...dislikes].some((item) =>
      String(item).toLowerCase().includes(value),
    );
  const normalizedIngredients = recipe.ingredients.map(
    window.ChefDomain.normalizeGroceryItem,
  );
  const ingredientIndexFor = (name) => {
    const wanted = String(name || "")
      .trim()
      .toLowerCase();
    if (!wanted) return -1;
    const exact = normalizedIngredients.findIndex(
      (item) => item.name.toLowerCase() === wanted,
    );
    if (exact >= 0) return exact;
    return normalizedIngredients.findIndex((item) => {
      const ingredientName = item.name.toLowerCase();
      return ingredientName.includes(wanted) || wanted.includes(ingredientName);
    });
  };
  const aiSwaps = recipe.substitutions
    .filter((item) => item?.from && item?.to)
    .map((item) => ({
      ...item,
      ingredientIndex: ingredientIndexFor(item.from),
    }))
    .filter((item) => item.ingredientIndex >= 0);
  const defaults = [];
  const addDefault = (pattern, replacement) => {
    const ingredientIndex = normalizedIngredients.findIndex((item) =>
      pattern.test(item.name),
    );
    if (ingredientIndex < 0) return;
    defaults.push({
      from: normalizedIngredients[ingredientIndex].name,
      ingredientIndex,
      ...replacement,
    });
  };
  if (has("lactose"))
    addDefault(/milk|cream|yogurt|牛奶|鮮奶油|优格|優格/i, {
      to: "Unsweetened soy yogurt",
      reason: "Keeps the dish creamy while respecting lactose intolerance.",
    });
  if (has("gluten"))
    addDefault(/soy sauce|醬油|酱油/i, {
      to: "Gluten-free tamari",
      reason: "Maintains a similar savory profile without gluten.",
    });
  if (has("nut"))
    addDefault(/peanut|cashew|almond|花生|腰果|杏仁/i, {
      to: "Roasted pumpkin seeds",
      reason: "Adds crunch without using nuts.",
    });
  if (has("shellfish"))
    addDefault(/shrimp|prawn|shellfish|蝦|虾|貝|贝/i, {
      to:
        has("vegan") || has("vegetarian")
          ? has("soy") || has("大豆")
            ? "Canned chickpeas"
            : "Extra-firm tofu"
          : "Boneless skinless chicken breast",
      reason: "Preserves the cooking method while avoiding shellfish.",
      category: "protein",
    });
  const proteinIndex = normalizedIngredients.findIndex(
    (item) =>
      item.category === "protein" ||
      /chicken|beef|pork|egg|tofu|protein|雞|鸡|牛|豬|猪|蛋|豆腐/i.test(
        item.name,
      ),
  );
  if (
    proteinIndex >= 0 &&
    (goal === "muscle_gain" || goal === "recomposition") &&
    !aiSwaps.some((swap) => swap.ingredientIndex === proteinIndex)
  ) {
    const original = normalizedIngredients[proteinIndex];
    const usePlantProtein = !/tofu|tempeh|chickpea|豆腐|鷹嘴豆|鹰嘴豆/i.test(
      original.name,
    );
    const avoidsSoy = has("soy") || has("大豆");
    defaults.push({
      from: original.name,
      ingredientIndex: proteinIndex,
      to: usePlantProtein
        ? avoidsSoy
          ? "Canned chickpeas"
          : "Extra-firm tofu"
        : has("vegan") || has("vegetarian")
          ? avoidsSoy
            ? "Cooked green lentils"
            : "Extra-firm tofu"
          : "Boneless skinless chicken breast",
      quantity:
        original.unit === "piece" ? 200 : Math.max(original.quantity || 0, 200),
      unit: "g",
      preparation: usePlantProtein
        ? "pressed and cut to match the recipe"
        : "cut to match the recipe",
      category: "protein",
      reason: "Helps the meal better support your protein target.",
    });
  }
  const swaps = [...aiSwaps, ...defaults]
    .filter(
      (swap, index, all) =>
        all.findIndex(
          (item) =>
            item.ingredientIndex === swap.ingredientIndex &&
            item.to === swap.to,
        ) === index,
    )
    .slice(0, 4);
  if (!swaps.length) return null;
  const card = document.createElement("article");
  card.className = "card personalized-swaps";
  card.innerHTML = `<div class="swaps-heading"><div><p class="eyebrow">PERSONALIZED HEALTHY SWAPS</p><h2>Make this meal work for <em>you.</em></h2><p>Choose any replacements now. Your ingredient list and grocery list will update immediately.</p></div><span class="swap-badge">Profile applied ✓</span></div><div class="swap-grid">${swaps.map((swap, index) => `<article><small>SWAP ${index + 1}</small><b>${esc(swap.from)}</b><i>→</i><strong>${esc(swap.to)}</strong><p>${esc(swap.reason || "A profile-safe alternative for this meal.")}</p><button class="cream" data-apply-swap="${index}">Use this swap</button></article>`).join("")}</div><p class="swap-cooking-warning hidden" role="alert"></p><p class="swap-note">Jarvis avoids your saved allergies and dietary restrictions. Check packaged ingredients when allergies are severe.</p>`;
  document
    .querySelector("#plan .guided-preview")
    .insertAdjacentElement("beforebegin", card);
  card.querySelectorAll("[data-apply-swap]").forEach(
    (button) =>
      (button.onclick = async () => {
        const swap = swaps[Number(button.dataset.applySwap)];
        button.disabled = true;
        button.textContent = "Applying swap…";
        await onApply(swap.ingredientIndex, swap);
        button.textContent = "Swap applied ✓";
      }),
  );
  return card;
}

function renderShoppingChecklist(title, ingredients) {
  ingredients = ingredients.map(window.ChefDomain.normalizeGroceryItem);
  const card = document.createElement("article");
  card.className = "card shopping-checklist";
  card.innerHTML = `<div class="shopping-head"><div><p class="eyebrow">SMART GROCERY LIST</p><h2>What do you need to buy?</h2><p>Select the ingredients you still need. Exact quantities stay visible while you shop.</p></div><button class="dark" id="save-shopping-list">Save to Grocery List →</button></div><div class="shopping-items">${ingredients.map((item, index) => `<label><input type="checkbox" data-shopping-item="${index}" checked><span class="shopping-box">✓</span><b>${esc(item.name || "Ingredient")}</b><small>${esc(window.ChefDomain.ingredientDetails(item))}</small></label>`).join("")}</div><p class="shopping-status" id="shopping-status" role="status">${ingredients.length} items selected</p>`;
  const preview = document.querySelector("#plan .guided-preview");
  preview.insertAdjacentElement("beforebegin", card);
  const updateStatus = () => {
    const count = card.querySelectorAll("[data-shopping-item]:checked").length;
    card.querySelector("#shopping-status").textContent =
      `${count} item${count === 1 ? "" : "s"} selected`;
  };
  card
    .querySelectorAll("[data-shopping-item]")
    .forEach((input) => (input.onchange = updateStatus));
  card.querySelector("#save-shopping-list").onclick = async (event) => {
    const selected = [
      ...card.querySelectorAll("[data-shopping-item]:checked"),
    ].map((input) => ingredients[Number(input.dataset.shoppingItem)]);
    const status = card.querySelector("#shopping-status");
    if (!selected.length) {
      status.textContent = "Select at least one grocery item first.";
      status.classList.add("shopping-status-error");
      return toast("Select at least one grocery item first.");
    }
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Saving…";
    status.textContent = "Saving selected ingredients…";
    status.classList.remove("shopping-status-error");
    const { data: list, error: listError } = await sb
      .from("shopping_lists")
      .insert({
        user_id: user.id,
        app_user_id: user.id,
        title:
          `${window.I18n.code === "zh-TW" ? "購物" : "Shopping"} · ${title}`.slice(
            0,
            120,
          ),
        status: "active",
      })
      .select("id")
      .single();
    if (listError) {
      button.disabled = false;
      button.textContent = "Save to Grocery List →";
      status.textContent = listError.message;
      status.classList.add("shopping-status-error");
      return toast(listError.message);
    }
    const rows = selected.map((item) => ({
      shopping_list_id: list.id,
      ingredient: String(item.name || "Ingredient").slice(0, 160),
      quantity: item.quantity,
      unit: item.unit || null,
      category: item.category || "grocery",
      is_checked: false,
    }));
    const { error } = await sb.from("shopping_list_items").insert(rows);
    if (error) {
      await sb
        .from("shopping_lists")
        .delete()
        .eq("id", list.id)
        .eq("user_id", user.id);
      button.disabled = false;
      button.textContent = "Save to Grocery List →";
      status.textContent = error.message;
      status.classList.add("shopping-status-error");
      return toast(error.message);
    }
    button.textContent = "Saved to Grocery List ✓";
    shoppingSavedNotice = true;
    toast("Your grocery checklist is saved ✓");
    show("shopping");
  };
  return {
    updateIngredient(index, item) {
      const normalized = window.ChefDomain.normalizeGroceryItem(item);
      ingredients[index] = normalized;
      const input = card.querySelector(`[data-shopping-item="${index}"]`);
      const label = input?.closest("label");
      if (!label) return;
      label.querySelector("b").textContent = normalized.name;
      label.querySelector("small").textContent =
        window.ChefDomain.ingredientDetails(normalized);
    },
  };
}

async function addShoppingListToPantry(list) {
  const checkedItems = (list.shopping_list_items || []).filter(
    (item) => item.is_checked,
  );
  if (!checkedItems.length) return 0;
  const { data: pantryRows, error } = await sb
    .from("pantry_items")
    .select("id,name,quantity,unit")
    .eq("user_id", user.id);
  if (error) throw error;
  let stocked = 0;
  for (const item of checkedItems) {
    const grocery = window.ChefDomain.normalizeGroceryItem({
      name: item.ingredient,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    });
    const existing = (pantryRows || []).find(
      (row) =>
        String(row.name).trim().toLocaleLowerCase() ===
        grocery.name.trim().toLocaleLowerCase(),
    );
    let pantryId = existing?.id || null;
    if (existing && existing.quantity != null && existing.unit) {
      const addition = window.ChefDomain.convertQuantity(
        grocery.quantity,
        grocery.unit,
        existing.unit,
      );
      if (addition != null) {
        const { error: updateError } = await sb
          .from("pantry_items")
          .update({
            quantity:
              Math.round((Number(existing.quantity) + addition) * 100) / 100,
            source: "shopping_list",
          })
          .eq("id", existing.id)
          .eq("user_id", user.id);
        if (updateError) continue;
      } else {
        pantryId = null;
      }
    } else if (existing) {
      const { error: updateError } = await sb
        .from("pantry_items")
        .update({
          quantity: grocery.quantity,
          unit: grocery.unit || null,
          source: "shopping_list",
        })
        .eq("id", existing.id)
        .eq("user_id", user.id);
      if (updateError) pantryId = null;
    }
    if (!pantryId) {
      const { data: inserted, error: insertError } = await sb
        .from("pantry_items")
        .insert({
          user_id: user.id,
          app_user_id: user.id,
          name: grocery.name,
          quantity: grocery.quantity,
          unit: grocery.unit || null,
          storage_zone: ["seasoning", "grain", "oil", "other"].includes(
            grocery.category,
          )
            ? "pantry"
            : "fridge",
          source: "shopping_list",
        })
        .select("id")
        .single();
      if (insertError) continue;
      pantryId = inserted.id;
    }
    await sb
      .from("shopping_list_items")
      .update({ pantry_item_id: pantryId })
      .eq("id", item.id);
    stocked += 1;
  }
  if (stocked) {
    await sb
      .from("shopping_lists")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", list.id)
      .eq("user_id", user.id);
  }
  return stocked;
}

async function renderShoppingLists() {
  const root = document.querySelector("#shopping");
  if (!root || !user) return;
  const showSavedNotice = shoppingSavedNotice;
  shoppingSavedNotice = false;
  root.innerHTML = `<div class="title"><div><p class="eyebrow">AT THE STORE</p><h1>Your shopping<br><em>lists.</em></h1></div></div>${showSavedNotice ? '<div class="shopping-save-notice" role="status"><b>Saved to your grocery list ✓</b><span>The checked ingredients, quantities, and units are ready below.</span></div>' : ""}<div id="saved-shopping-lists"><p>Loading your lists…</p></div>`;
  const { data, error } = await sb
    .from("shopping_lists")
    .select(
      "id,title,status,created_at,shopping_list_items(id,ingredient,quantity,unit,category,is_checked,pantry_item_id)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const container = root.querySelector("#saved-shopping-lists");
  if (error) {
    container.innerHTML = `<article class="card shopping-empty"><h2>We could not load your lists.</h2><p>${esc(error.message)}</p></article>`;
    return;
  }
  if (!data.length) {
    container.innerHTML =
      '<article class="card shopping-empty"><h2>No saved lists yet.</h2><p>Generate a meal, choose the ingredients you need, then save them here.</p><button class="dark" data-go="home">Plan a meal →</button></article>';
    container.querySelector("[data-go]").onclick = () => show("home");
    return;
  }
  container.innerHTML = `<div class="saved-shopping-grid">${data
    .map((list, listIndex) => {
      const items = list.shopping_list_items || [];
      const allChecked =
        items.length > 0 && items.every((item) => item.is_checked);
      const displayItems = items.map((item) => {
        const grocery = window.ChefDomain.normalizeGroceryItem({
          name: item.ingredient,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
        });
        return {
          ...item,
          grocery,
          measurement: window.ChefDomain.groceryDisplayMeasurement(grocery),
        };
      });
      return `<article class="card saved-shopping-list" data-list-id="${esc(list.id)}" data-list-index="${listIndex}"><div class="saved-shopping-head"><div><p class="eyebrow">${items.filter((item) => item.is_checked).length} OF ${items.length} PICKED</p><h2>${esc(window.I18n.translate(list.title))}</h2><small>${esc(displayDate(list.created_at))}</small></div><button class="timer-remove" data-delete-list="${esc(list.id)}" aria-label="Delete list">×</button></div><div class="saved-shopping-items">${displayItems.map((item) => `<label class="${item.is_checked ? "checked" : ""}"><input type="checkbox" data-list-item="${esc(item.id)}" ${item.is_checked ? "checked" : ""}><span class="shopping-box">✓</span><b>${esc(item.grocery.name)}</b><small>${item.measurement.quantity == null ? window.I18n.translate("Quantity not specified") : `${esc(item.measurement.quantity)} ${esc(displayShoppingUnit(item.measurement.unit, item.measurement.quantity))}`}</small></label>`).join("")}</div><button class="dark stock-pantry" data-stock-list="${listIndex}" ${allChecked && list.status !== "completed" ? "" : "disabled"}>${list.status === "completed" ? "Added to pantry ✓" : "Add all purchased items to pantry →"}</button></article>`;
    })
    .join("")}</div>`;
  container.querySelectorAll("[data-list-item]").forEach(
    (input) =>
      (input.onchange = async (event) => {
        const checked = event.currentTarget.checked;
        event.currentTarget
          .closest("label")
          .classList.toggle("checked", checked);
        const { error: updateError } = await sb
          .from("shopping_list_items")
          .update({ is_checked: checked })
          .eq("id", event.currentTarget.dataset.listItem);
        if (updateError) {
          event.currentTarget.checked = !checked;
          event.currentTarget
            .closest("label")
            .classList.toggle("checked", !checked);
          toast(updateError.message);
          return;
        }
        const listCard = event.currentTarget.closest("[data-list-id]");
        const inputs = [...listCard.querySelectorAll("[data-list-item]")];
        const picked = inputs.filter((item) => item.checked).length;
        listCard.querySelector(".eyebrow").textContent =
          `${picked} OF ${inputs.length} PICKED`;
        const list = data[Number(listCard.dataset.listIndex)];
        const stockButton = listCard.querySelector("[data-stock-list]");
        if (stockButton) {
          stockButton.disabled =
            list.status === "completed" || picked !== inputs.length;
        }
        const changedItem = list.shopping_list_items.find(
          (item) => item.id === event.currentTarget.dataset.listItem,
        );
        if (changedItem) changedItem.is_checked = checked;
      }),
  );
  container.querySelectorAll("[data-stock-list]").forEach(
    (button) =>
      (button.onclick = async (event) => {
        const list = data[Number(event.currentTarget.dataset.stockList)];
        event.currentTarget.disabled = true;
        event.currentTarget.textContent = "Adding to pantry…";
        try {
          const count = await addShoppingListToPantry(list);
          event.currentTarget.textContent = "Added to pantry ✓";
          toast(
            `${count} purchased item${count === 1 ? "" : "s"} added to your pantry ✓`,
          );
          renderPantry();
        } catch (error) {
          event.currentTarget.disabled = false;
          event.currentTarget.textContent =
            "Add all purchased items to pantry →";
          toast(error.message || "Could not update your pantry.");
        }
      }),
  );
  container.querySelectorAll("[data-delete-list]").forEach(
    (button) =>
      (button.onclick = async (event) => {
        const confirmed = await confirmAction({
          title: "Delete this shopping list?",
          message:
            "The list and all of its checked-item progress will be removed.",
          confirmLabel: "Delete list",
        });
        if (!confirmed) return;
        const listCard = event.currentTarget.closest("[data-list-id]");
        const itemIds = [...listCard.querySelectorAll("[data-list-item]")].map(
          (input) => input.dataset.listItem,
        );
        if (itemIds.length) {
          const { error: itemDeleteError } = await sb
            .from("shopping_list_items")
            .delete()
            .in("id", itemIds);
          if (itemDeleteError) {
            toast(itemDeleteError.message);
            return;
          }
        }
        const { error: deleteError } = await sb
          .from("shopping_lists")
          .delete()
          .eq("id", event.currentTarget.dataset.deleteList)
          .eq("user_id", user.id);
        if (deleteError) toast(deleteError.message);
        else {
          listCard.remove();
          toast("Shopping list deleted");
        }
      }),
  );
}

async function renderUsdaReference(recipe) {
  const renderVersion = ++usdaRenderVersion;
  const ingredients = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
    : [];
  document.querySelector("#plan .usda-reference")?.remove();
  const card = document.createElement("article");
  card.className = "card usda-reference";
  card.innerHTML =
    '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>Verifying ingredient nutrition…</h2><p>Jarvis is matching your ingredient list to USDA reference foods in the background.</p>';
  document
    .querySelector("#plan .shopping-checklist")
    .insertAdjacentElement("afterend", card);
  const lookupIngredients = ingredients
    .map(window.ChefDomain.normalizeGroceryItem)
    .filter((item) => item.usda_query || !/[\u3400-\u9fff]/.test(item.name));
  if (!lookupIngredients.length) {
    card.innerHTML =
      '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>No matching USDA reference is available.</h2><p>This older localized recipe does not include English USDA search names. The recipe and grocery quantities are still available.</p>';
    return;
  }
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (!session) throw new Error("Session expired");
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/chef-usda-nutrition`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ingredients: lookupIngredients }),
      },
    );
    if (!response.ok) throw new Error("USDA lookup unavailable");
    const data = await response.json();
    const foods = (data.foods || []).filter((food) => food.found);
    if (!foods.length) throw new Error("No USDA matches found");
    if (renderVersion !== usdaRenderVersion || !card.isConnected) return;
    const total = window.ChefDomain.calculateUsdaMealNutrition(
      ingredients,
      foods,
    );
    const servings = Math.max(1, finiteNumber(recipe.servings, 1));
    const proteinTarget = finiteNumber(profile?.protein_g, 0);
    const proteinPercent = proteinTarget
      ? Math.round((total.protein_g / servings / proteinTarget) * 100)
      : 0;
    const zh = window.I18n.code === "zh-TW";
    const coverageText = zh
      ? `已對照 ${total.coverage_percent}% 的食材${total.estimated_conversions ? ` · ${total.estimated_conversions} 項家用單位採用估算換算` : ""}。無可靠克重的包裝或個數單位不會被猜測計入。`
      : `${total.coverage_percent}% ingredient coverage${total.estimated_conversions ? ` · ${total.estimated_conversions} household-unit conversions are estimated` : ""}. Unmatched package or piece units are excluded instead of guessed.`;
    recipe.usda_nutrition = total;
    if (currentPlan) currentPlan.usda_nutrition = total;
    const estimate = {
      kcal: finiteNumber(recipe.kcal),
      protein_g: finiteNumber(recipe.protein_g),
      carbs_g: finiteNumber(recipe.carbs_g),
      fat_g: finiteNumber(recipe.fat_g),
      basis: "AI recipe estimate for the whole recipe",
    };
    if (activeRecipeId) {
      const persistedRecipe = currentPlan || recipe;
      sb.from("recipes")
        .update({
          recipe: persistedRecipe,
          nutrition: { estimate, usda: total },
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeRecipeId)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) console.warn("Could not persist USDA totals", error);
        });
    }
    card.innerHTML = `<p class="eyebrow">USDA FOODDATA CENTRAL · WHOLE MEAL</p><h2>USDA-backed meal nutrition.</h2><p>${coverageText}</p><div class="usda-total"><div><b>${displayNumber(total.kcal)}</b><span>${zh ? "大卡 · 整份食譜" : "kcal · whole recipe"}</span><small>${displayNumber(total.kcal / servings)} ${zh ? "每人份" : "per serving"}</small></div><div><b>${displayNumber(total.protein_g, "g")}</b><span>${zh ? "蛋白質 · 整份食譜" : "protein · whole recipe"}</span><small>${displayNumber(total.protein_g / servings, "g")} ${zh ? `每人份 · 每日目標的 ${proteinPercent}%` : `per serving · ${proteinPercent}% of daily target`}</small></div><div><b>${displayNumber(total.carbs_g, "g")}</b><span>${zh ? "碳水化合物" : "carbs"}</span><small>${displayNumber(total.carbs_g / servings, "g")} ${zh ? "每人份" : "per serving"}</small></div><div><b>${displayNumber(total.fat_g, "g")}</b><span>${zh ? "脂肪" : "fat"}</span><small>${displayNumber(total.fat_g / servings, "g")} ${zh ? "每人份" : "per serving"}</small></div></div><details><summary>View USDA ingredient matches</summary><div class="usda-grid">${foods
      .slice(0, 8)
      .map(
        (food) =>
          `<div><b>${esc(food.ingredient)}</b><span>${displayNumber(food.per100g?.kcal)} kcal / 100 g</span><small>P ${displayNumber(food.per100g?.protein_g, "g")} · C ${displayNumber(food.per100g?.carbs_g, "g")} · F ${displayNumber(food.per100g?.fat_g, "g")}</small></div>`,
      )
      .join("")}</div></details>`;
  } catch (error) {
    const noMatches =
      error instanceof Error && error.message === "No USDA matches found";
    card.innerHTML = noMatches
      ? '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>No matching USDA reference is available.</h2><p>USDA did not return a reliable match for these ingredients. Your recipe and grocery quantities are unaffected.</p>'
      : '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>USDA reference data is unavailable right now.</h2><p>Your recipe and grocery quantities are ready; only the optional nutrition reference could not be loaded.</p>';
  }
}

async function generatePlan(request) {
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/chef-meal-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ request, language: window.I18n.code }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Jarvis could not create a plan.");
  const plan = {
    ...data.plan,
    userRequest: request,
    fallback: Boolean(data.fallback || data.plan?.fallback),
  };
  return persistGeneratedPlan(plan, request);
}

async function persistGeneratedPlan(plan, request) {
  try {
    const { data: saved, error } = await sb
      .from("recipes")
      .insert({
        user_id: user.id,
        app_user_id: user.id,
        title: String(plan.title || request).slice(0, 160),
        servings: finiteNumber(plan.servings, 2),
        minutes: finiteNumber(plan.minutes),
        recipe: plan,
        nutrition: {
          estimate: {
            kcal: finiteNumber(plan.kcal),
            protein_g: finiteNumber(plan.protein_g),
            carbs_g: finiteNumber(plan.carbs_g),
            fat_g: finiteNumber(plan.fat_g),
            basis: "AI recipe estimate for the whole recipe",
          },
        },
        adaptations: Array.isArray(plan.substitutions)
          ? plan.substitutions
          : [],
        is_saved: false,
      })
      .select("id")
      .single();
    if (error) throw error;
    plan.saved_recipe_id = saved.id;
    plan.is_saved = false;
  } catch (error) {
    console.warn("Could not save meal plan", error);
    toast("Your plan is ready, but it could not be saved yet.");
  }
  return plan;
}

function recipeNutritionPerServing(recipe) {
  const servings = Math.max(1, finiteNumber(recipe.servings, 1));
  const total = recipe.usda_nutrition || {
    kcal: finiteNumber(recipe.kcal, 0),
    protein_g: finiteNumber(recipe.protein_g, 0),
    carbs_g: finiteNumber(recipe.carbs_g, 0),
    fat_g: finiteNumber(recipe.fat_g, 0),
    coverage_percent: null,
    source: "AI recipe estimate",
  };
  return {
    calories: finiteNumber(total.kcal, 0) / servings,
    protein_g: finiteNumber(total.protein_g, 0) / servings,
    carbs_g: finiteNumber(total.carbs_g, 0) / servings,
    fat_g: finiteNumber(total.fat_g, 0) / servings,
    nutrition_source: recipe.usda_nutrition
      ? "usda_fooddata_central"
      : "recipe_estimate",
    usda_coverage: recipe.usda_nutrition?.coverage_percent ?? null,
  };
}

function nutritionForServings(recipe, servingsEaten = 1) {
  const servings = Math.max(0.25, finiteNumber(servingsEaten, 1));
  const perServing = recipeNutritionPerServing(recipe);
  return {
    calories: perServing.calories * servings,
    protein_g: perServing.protein_g * servings,
    carbs_g: perServing.carbs_g * servings,
    fat_g: perServing.fat_g * servings,
    nutrition_source: perServing.nutrition_source,
    usda_coverage: perServing.usda_coverage,
    servings_eaten: servings,
  };
}

async function logCompletedMeal(recipe, servingsEaten = 1) {
  const { data, error } = await sb
    .from("nutrition_logs")
    .insert({
      user_id: user.id,
      app_user_id: user.id,
      recipe_id: recipe.saved_recipe_id || null,
      recipe_title: String(recipe.title || "Completed meal").slice(0, 160),
      eaten_on: localDateKey(),
      ...nutritionForServings(recipe, servingsEaten),
    })
    .select("id")
    .single();
  if (error) console.warn("Could not log completed meal", error);
  return error ? null : data.id;
}

async function deductRecipeFromPantry(recipe) {
  const recipeItems = window.ChefDomain.mergeGroceryItems(
    recipe.ingredients || [],
  );
  if (!recipeItems.length) return 0;
  const { data: pantryRows, error } = await sb
    .from("pantry_items")
    .select("id,name,quantity,unit")
    .eq("user_id", user.id);
  if (error) {
    console.warn("Could not load pantry for deduction", error);
    return 0;
  }
  let updated = 0;
  for (const ingredient of recipeItems) {
    const pantryItem = (pantryRows || []).find(
      (item) =>
        String(item.name).trim().toLocaleLowerCase() ===
        ingredient.name.trim().toLocaleLowerCase(),
    );
    if (!pantryItem || pantryItem.quantity == null || !pantryItem.unit)
      continue;
    const used = window.ChefDomain.convertQuantity(
      ingredient.quantity,
      ingredient.unit,
      pantryItem.unit,
    );
    if (used == null) continue;
    const remaining = Number(pantryItem.quantity) - used;
    const query =
      remaining <= 0
        ? sb.from("pantry_items").delete().eq("id", pantryItem.id)
        : sb
            .from("pantry_items")
            .update({ quantity: Math.round(remaining * 100) / 100 })
            .eq("id", pantryItem.id);
    const { error: updateError } = await query.eq("user_id", user.id);
    if (!updateError) updated += 1;
  }
  return updated;
}

function openMealFeedback(recipe, nutritionLogPromise) {
  const modal = document.createElement("div");
  modal.className = "modal meal-feedback-modal";
  const recipeServings = Math.max(1, finiteNumber(recipe.servings, 1));
  modal.innerHTML = `<form class="modal-card feedback-card"><p class="eyebrow">HELP JARVIS LEARN</p><h2>How did this meal taste?</h2><p>One quick rating helps future recipes fit you better.</p><div class="field"><label>Servings you ate</label><input name="servings_eaten" type="number" min="0.25" max="${recipeServings}" step="0.25" value="1" required><small>Nutrition starts at one serving. Change this if you ate more.</small></div><div class="rating-row" role="radiogroup" aria-label="Meal rating">${[1, 2, 3, 4, 5].map((rating) => `<label><input type="radio" name="rating" value="${rating}" required><span>${rating}★</span></label>`).join("")}</div><div class="field"><label>Optional note</label><input name="note" maxlength="300" placeholder="e.g. Less spicy next time"></div><div class="form-actions"><button type="button" class="cream" data-feedback-skip>Skip rating</button><button type="submit" class="dark">Save feedback →</button></div></form>`;
  document.body.append(modal);
  const close = bindDismissibleModal(modal);
  const form = modal.querySelector("form");
  const updateLoggedServings = async (rawValue) => {
    const servingsEaten = Math.max(
      0.25,
      Math.min(recipeServings, finiteNumber(rawValue, 1)),
    );
    const nutritionLogId = await nutritionLogPromise;
    if (!nutritionLogId || servingsEaten === 1) return;
    const { error } = await sb
      .from("nutrition_logs")
      .update(nutritionForServings(recipe, servingsEaten))
      .eq("id", nutritionLogId)
      .eq("user_id", user.id);
    if (error) console.warn("Could not update meal servings", error);
    else renderDailyNutritionProgress();
  };
  modal.querySelector("[data-feedback-skip]").onclick = () => {
    const servingsEaten = new FormData(form).get("servings_eaten");
    close();
    updateLoggedServings(servingsEaten);
  };
  modal.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const saveButton = event.currentTarget.querySelector(
      'button[type="submit"]',
    );
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    await updateLoggedServings(values.get("servings_eaten"));
    const { error } = await sb.from("recipe_feedback").insert({
      user_id: user.id,
      recipe_id: recipe.saved_recipe_id || null,
      recipe_title: String(recipe.title || "Completed meal").slice(0, 160),
      rating: Number(values.get("rating")),
      note:
        String(values.get("note") || "")
          .trim()
          .slice(0, 300) || null,
    });
    if (error) {
      saveButton.disabled = false;
      saveButton.textContent = "Save feedback →";
      return toast(error.message);
    }
    close();
    toast("Thanks — Jarvis will remember this for future meals ✓");
  };
}

async function completeCooking(recipe) {
  stopVoiceControl();
  clearCookingState();
  releaseWakeLock();
  renderCook();
  const nutritionLogPromise = logCompletedMeal(recipe);
  openMealFeedback(recipe, nutritionLogPromise);
  nutritionLogPromise.then((logId) => {
    if (logId) renderDailyNutritionProgress();
  });
  deductRecipeFromPantry(recipe).then((pantryCount) => {
    if (pantryCount)
      toast(
        `${pantryCount} pantry item${pantryCount === 1 ? "" : "s"} updated ✓`,
      );
  });
}

function updateVoiceButton() {
  const button = document.querySelector("#chef-voice");
  if (!button) return;
  button.classList.toggle("voice-active", voiceListening);
  button.textContent = voiceListening ? "🎙 Listening…" : "🎙 Hands-free";
}

function handleVoiceCommand(transcript) {
  const command = String(transcript || "")
    .trim()
    .toLocaleLowerCase();
  if (!command) return;
  const completeButton = document.querySelector("#complete-step");
  const previousButton = document.querySelector("#previous-step");
  const timerButton = document.querySelector("#start-current-step-timer");
  const timerIndex = Number(timerButton?.dataset.timerIndex);
  const timer = timers[timerIndex];
  if (/下一步|完成(?:這|这)?步|next step|complete step/.test(command))
    completeButton?.click();
  else if (/上一步|previous step|go back/.test(command))
    previousButton?.click();
  else if (/重複|重复|再說一次|repeat/.test(command))
    document.querySelector("#repeat-step")?.click();
  else if (
    /開始(?:計時|倒數)|开始(?:计时|倒数)|start (?:timer|countdown)/.test(
      command,
    )
  ) {
    if (!timer?.running) timerButton?.click();
  } else if (
    /暫停(?:計時|倒數)|暂停(?:计时|倒数)|pause (?:timer|countdown)/.test(
      command,
    )
  ) {
    if (timer?.running) timerButton?.click();
  }
}

function startVoiceControl() {
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition)
    return toast("Voice control is not supported in this browser.");
  if (!speechRecognition) {
    speechRecognition = new Recognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = false;
    speechRecognition.onresult = (event) => {
      if (voicePausedForSpeech) return;
      const result = event.results[event.results.length - 1];
      handleVoiceCommand(result?.[0]?.transcript || "");
    };
    speechRecognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        voiceListening = false;
        updateVoiceButton();
        toast("Microphone access is needed for hands-free cooking.");
      }
    };
    speechRecognition.onend = () => {
      if (!voiceListening || voicePausedForSpeech) return;
      setTimeout(() => {
        try {
          speechRecognition.start();
        } catch {
          voiceListening = false;
          updateVoiceButton();
        }
      }, 250);
    };
  }
  speechRecognition.lang = window.I18n.code === "zh-TW" ? "zh-TW" : "en-US";
  voicePausedForSpeech = false;
  voiceListening = true;
  try {
    speechRecognition.start();
  } catch {
    // Recognition may already be running after a Chef Mode rerender.
  }
  updateVoiceButton();
  toast("Say: next step, repeat, start timer, or pause timer.");
}

function stopVoiceControl() {
  voiceListening = false;
  voicePausedForSpeech = false;
  try {
    speechRecognition?.stop();
  } catch {
    // The recognition session may already be stopped.
  }
  updateVoiceButton();
}

function toggleVoiceControl() {
  if (voiceListening) stopVoiceControl();
  else startVoiceControl();
}

function renderCook() {
  const root = document.querySelector("#cook");
  if (!root) return;
  if (!activeRecipe) {
    releaseWakeLock();
    root.innerHTML = `<div class="chef-empty-state card"><span>CHEF MODE · READY</span><h1>No recipe is cooking yet.</h1><p>Generate a meal or open a saved recipe, then choose “Start guided cooking”.</p><button class="dark" id="empty-cook-plan">Plan a recipe →</button></div>`;
    root.querySelector("#empty-cook-plan").onclick = () => show("home");
    return;
  }
  const recipe = activeRecipe;
  const steps = window.ChefDomain.normalizeRecipeSteps(recipe.steps);
  if (!steps.length) {
    clearCookingState();
    return renderCook();
  }
  const adaptations = recipe.equipment_adaptations?.length
    ? recipe.equipment_adaptations
    : chefEquipmentAdaptations;
  cookingStepIndex = Math.max(0, Math.min(cookingStepIndex, steps.length - 1));
  const currentStep = steps[cookingStepIndex];
  const current = currentStep.instruction;
  const currentTimerIndex = timers.findIndex(
    (timer) =>
      timer.source === "recipe" && timer.stepIndex === cookingStepIndex,
  );
  const currentTimer = timers[currentTimerIndex];
  const currentTimerMarkup = currentStep.timer
    ? `<button type="button" class="current-step-timer" id="start-current-step-timer" data-timer-index="${currentTimerIndex}" aria-label="${esc(currentTimer?.running ? "Pause this timer" : currentTimer?.completed ? "Restart this timer" : "Start this timer")}"><b>⏱ ${esc(currentStep.timer.label)}<small>${currentTimer?.running ? "Pause timer" : currentTimer?.completed ? "Restart timer" : "Start timer"}</small></b><span>${formatTime(currentTimer?.sec ?? currentStep.timer.duration_seconds)}</span></button>`
    : "";
  root.innerHTML = `
    <div class="chef-mode-heading"><div><p class="eyebrow">CHEF MODE · ${activeRecipe ? "ACTIVE RECIPE" : "READY"}</p><h1>${esc(recipe.title)}<br><em>cook with Jarvis.</em></h1></div><div class="chef-voice-actions"><button class="cream" id="chef-voice">🎙 Hands-free</button><button class="cream" id="chef-read">🔊 Read current step</button></div></div>
    <div class="chef-mode-grid"><section class="chef-guide"><div class="chef-step-counter"><span>STEP ${cookingStepIndex + 1} / ${steps.length}</span><div>${steps.map((_, index) => `<i class="${index < cookingStepIndex ? "done" : index === cookingStepIndex ? "now" : ""}"></i>`).join("")}</div></div><article class="current-step chef-current"><span>DO THIS NOW</span><h2>${esc(current)}</h2>${currentTimerMarkup}<p>Only real cooking and waiting times become recipe countdowns. Your progress survives a refresh.</p></article><div class="guide-actions"><button class="cream" id="previous-step" ${cookingStepIndex === 0 ? "disabled" : ""}>← Previous</button><button class="cream" id="repeat-step">↻ Repeat</button><button class="dark" id="complete-step">${cookingStepIndex === steps.length - 1 ? "Finish dish ✓" : "Complete step →"}</button></div><div class="chef-queue"><p class="eyebrow">RECIPE QUEUE</p>${steps.map((step, index) => `<button class="${index === cookingStepIndex ? "current" : index < cookingStepIndex ? "done" : ""}" data-jump-step="${index}"><b>${index < cookingStepIndex ? "✓" : index + 1}</b><span>${esc(step.instruction)}</span></button>`).join("")}</div>${
      adaptations.length
        ? `<div class="chef-adaptation-inline"><p class="eyebrow">YOUR EQUIPMENT OPTION</p>${adaptations
            .slice(0, 2)
            .map(
              (item) =>
                `<div><b>${esc(item.original)} → ${esc(item.alternative)}</b><p>${esc(item.instructions)}</p></div>`,
            )
            .join("")}</div>`
        : ""
    }</section>
      <aside class="timers chef-timers"><div class="timer-head"><div><p class="eyebrow">RECIPE TIMERS</p><h2>Kitchen clocks</h2></div><button class="dark" id="add-timer">＋ Add clock</button></div><p class="timer-note">Jarvis adds countdowns only for real cooking or waiting intervals. You can add a separate clock when needed.</p><div class="timer-list" id="timer-list"></div></aside></div>`;
  root.querySelector("#chef-read").onclick = () => sayInstruction(current);
  root.querySelector("#chef-voice").onclick = toggleVoiceControl;
  updateVoiceButton();
  root.querySelector("#previous-step").onclick = () => {
    cookingStepIndex--;
    persistCookingState();
    renderCook();
  };
  root.querySelector("#repeat-step").onclick = () => sayInstruction(current);
  root
    .querySelector("#start-current-step-timer")
    ?.addEventListener("click", async (event) => {
      let timerIndex = Number(event.currentTarget.dataset.timerIndex);
      if (timerIndex < 0) {
        const timer = window.ChefDomain.buildRecipeTimers([currentStep])[0];
        if (!timer) return;
        timer.stepIndex = cookingStepIndex;
        timer.stepNumber = cookingStepIndex + 1;
        timers.push(timer);
        timerIndex = timers.length - 1;
      }
      await toggleTimer(timerIndex);
      renderCook();
    });
  root.querySelector("#complete-step").onclick = async (event) => {
    if (cookingStepIndex < steps.length - 1) {
      cookingStepIndex++;
      persistCookingState();
      renderCook();
    } else {
      event.currentTarget.disabled = true;
      const completedRecipe = {
        ...recipe,
        saved_recipe_id: activeRecipeId || recipe.saved_recipe_id || null,
      };
      toast("Dish completed — great cooking! ✓");
      sayInstruction(
        /[\u3400-\u9fff]/.test(current)
          ? "料理完成，辛苦了！"
          : "Dish completed. Great cooking.",
      );
      await completeCooking(completedRecipe);
    }
  };
  root.querySelectorAll("[data-jump-step]").forEach(
    (button) =>
      (button.onclick = () => {
        cookingStepIndex = Number(button.dataset.jumpStep);
        persistCookingState();
        renderCook();
      }),
  );
  root.querySelector("#add-timer").onclick = openClockModal;
  renderTimerList();
}

function openClockModal() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<form class="modal-card clock-modal" id="clock-form"><p class="eyebrow">ADD A KITCHEN CLOCK</p><h2>Track another task.</h2><div class="form-grid"><div class="field"><label>Task name</label><input name="name" required maxlength="70" placeholder="e.g. Rice resting"></div><div class="field"><label>Clock type</label><select name="mode"><option value="countdown">Countdown</option><option value="stopwatch">Stopwatch</option></select></div><div class="field" id="clock-minutes"><label>Minutes</label><input name="minutes" type="number" min="1" max="240" value="5"></div></div><div class="form-actions"><button type="button" class="cream" id="close-clock">Cancel</button><button class="dark">Add clock →</button></div></form>`;
  document.body.append(modal);
  const closeModal = bindDismissibleModal(modal);
  const form = modal.querySelector("#clock-form");
  form.mode.onchange = () =>
    modal
      .querySelector("#clock-minutes")
      .classList.toggle("hidden", form.mode.value === "stopwatch");
  modal.querySelector("#close-clock").onclick = closeModal;
  form.onsubmit = (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const mode = String(data.get("mode"));
    const seconds =
      mode === "countdown" ? Math.round(Number(data.get("minutes")) * 60) : 0;
    if (!Number.isFinite(seconds) || seconds < 0) return;
    timers.push({
      name: String(data.get("name")).trim(),
      sec: seconds,
      duration: seconds,
      mode,
      running: false,
      completed: false,
      source: "manual",
    });
    closeModal();
    persistCookingState();
    renderTimerList();
  };
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

async function toggleTimer(index) {
  const timer = timers[index];
  if (!timer) return;
  if (timer.completed || (timer.mode === "countdown" && timer.sec === 0)) {
    timer.sec = timer.duration || 300;
    timer.completed = false;
  }
  timer.running = !timer.running;
  lastTimerTick = Date.now();
  if (
    timer.running &&
    timer.mode === "countdown" &&
    "Notification" in window &&
    Notification.permission === "default"
  )
    Notification.requestPermission();
  prepareAlarmAudio();
  await requestWakeLock();
  persistCookingState();
  renderTimerList();
}

function renderCurrentStepTimer() {
  const button = document.querySelector("#start-current-step-timer");
  if (!button || !activeRecipe) return;
  let timerIndex = Number(button.dataset.timerIndex);
  let timer = Number.isInteger(timerIndex) ? timers[timerIndex] : null;
  if (
    !timer ||
    timer.source !== "recipe" ||
    timer.stepIndex !== cookingStepIndex
  ) {
    timerIndex = timers.findIndex(
      (item) => item.source === "recipe" && item.stepIndex === cookingStepIndex,
    );
    timer = timers[timerIndex];
  }
  button.dataset.timerIndex = String(timerIndex);
  const currentStep = window.ChefDomain.normalizeRecipeSteps(
    activeRecipe.steps,
  )[cookingStepIndex];
  const status = timer?.running
    ? "Pause"
    : timer?.completed
      ? "Restart"
      : "Start";
  button.setAttribute("aria-label", `${status} this timer`);
  const statusText = button.querySelector("small");
  const timeText = button.querySelector("span");
  if (statusText) statusText.textContent = `${status} timer`;
  if (timeText)
    timeText.textContent = formatTime(
      timer?.sec ?? currentStep?.timer?.duration_seconds ?? 0,
    );
}

function renderTimerList() {
  renderCurrentStepTimer();
  const list = document.querySelector("#timer-list");
  if (!list) return;
  if (!timers.length) {
    list.innerHTML = `<div class="timer-empty"><b>No recipe countdown is needed.</b><span>This recipe has no timed heat or waiting step. Add a clock only if you need one.</span></div>`;
    return;
  }
  list.innerHTML = timers
    .map(
      (timer, index) =>
        `<article class="timer chef-timer ${timer.completed ? "timer-complete" : ""} ${timer.stepIndex === cookingStepIndex ? "timer-current-step" : ""}"><span><i>${timer.completed ? "✓" : timer.mode === "stopwatch" ? "◷" : "◴"}</i>${esc(timer.name)}<small>${timer.completed ? "Finished" : timer.mode === "stopwatch" ? "Stopwatch" : timer.stepNumber ? `Step ${timer.stepNumber} · Recipe countdown` : "Countdown"}</small></span><b>${formatTime(timer.sec)}</b><div class="timer-actions"><button data-start="${index}">${timer.completed ? "Restart" : timer.running ? "Pause" : "Start"}</button><button data-reset="${index}">Reset</button><button class="timer-remove" data-remove="${index}" aria-label="Remove clock">×</button></div></article>`,
    )
    .join("");
  list
    .querySelectorAll("[data-start]")
    .forEach(
      (button) =>
        (button.onclick = () => toggleTimer(Number(button.dataset.start))),
    );
  list.querySelectorAll("[data-reset]").forEach(
    (button) =>
      (button.onclick = () => {
        const timer = timers[Number(button.dataset.reset)];
        timer.sec = timer.mode === "countdown" ? timer.duration || 300 : 0;
        timer.running = false;
        timer.completed = false;
        persistCookingState();
        renderTimerList();
      }),
  );
  list.querySelectorAll("[data-remove]").forEach(
    (button) =>
      (button.onclick = () => {
        timers.splice(Number(button.dataset.remove), 1);
        persistCookingState();
        renderTimerList();
      }),
  );
}

function prepareAlarmAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!alarmAudioContext) alarmAudioContext = new AudioContext();
    if (alarmAudioContext.state === "suspended") alarmAudioContext.resume();
  } catch (error) {
    console.info("Audio alarm unavailable", error);
  }
}

function playTimerAlarm() {
  try {
    prepareAlarmAudio();
    const context = alarmAudioContext;
    if (!context) return;
    [0, 0.35, 0.7].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(
        0.35,
        context.currentTime + offset + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + offset + 0.22,
      );
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + offset);
      oscillator.stop(context.currentTime + offset + 0.24);
    });
  } catch (error) {
    console.info("Audio alarm unavailable", error);
  }
}

function flashTimerTitle(name) {
  const original = document.title;
  clearInterval(titleFlashInterval);
  let visible = false;
  titleFlashInterval = setInterval(() => {
    document.title = visible ? original : `⏰ ${name} finished!`;
    visible = !visible;
  }, 700);
  setTimeout(() => {
    clearInterval(titleFlashInterval);
    document.title = original;
  }, 10000);
}

function announceTimerComplete(timer) {
  playTimerAlarm();
  toast(`${timer.name} finished! ⏰`);
  flashTimerTitle(timer.name);
  const steps = activeRecipe
    ? window.ChefDomain.normalizeRecipeSteps(activeRecipe.steps)
    : [];
  const nextStepIndex = Number.isInteger(timer.stepIndex)
    ? timer.stepIndex + 1
    : -1;
  const nextStep = steps[nextStepIndex];
  const usesChinese = /[\u3400-\u9fff]/.test(
    `${timer.name}${nextStep?.instruction || ""}`,
  );
  sayInstruction(
    nextStep
      ? usesChinese
        ? `${timer.name}完成，可以進行步驟 ${nextStepIndex + 1}：${nextStep.instruction}`
        : `${timer.name} is finished. Continue to step ${nextStepIndex + 1}: ${nextStep.instruction}`
      : usesChinese
        ? `${timer.name}完成。`
        : `${timer.name} is finished.`,
  );
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Chef Jarvis timer finished", {
      body: timer.name,
      tag: `chef-timer-${timer.name}`,
    });
  }
}

setInterval(() => {
  const now = Date.now();
  const elapsed = Math.floor((now - lastTimerTick) / 1000);
  if (elapsed < 1) return;
  lastTimerTick += elapsed * 1000;
  const { changed, completed } = window.ChefDomain.tickTimers(timers, elapsed);
  if (!changed) return;
  persistCookingState();
  renderTimerList();
  completed.forEach(announceTimerComplete);
}, 250);

startApp();
