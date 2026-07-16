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
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = /[\u3400-\u9fff]/.test(text)
    ? "zh-TW"
    : document.documentElement.lang || navigator.language || "en-US";
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
  return number == null ? "—" : `${number}${suffix}`;
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
        saved_recipe_id: query.saved_recipe_id || null,
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
    renderSavedPlans();
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
    renderUsdaReference(recipe.ingredients);
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
  controls.innerHTML =
    '<span>Saved to your recipes</span><button class="cream" id="cook-later">Cook later ✓</button>';
  title.append(controls);
  controls.querySelector("#cook-later").onclick = (event) => {
    event.currentTarget.textContent = "Saved for later ✓";
    toast("Find this meal under Recent plans whenever you are ready to cook.");
  };
}

function planFromSavedRow(row) {
  const recipe = row.recipe || {};
  const estimate = row.nutrition?.estimate || row.nutrition || {};
  return {
    ...recipe,
    title: row.title,
    minutes: row.minutes ?? recipe.minutes,
    servings: row.servings ?? recipe.servings ?? 2,
    kcal: estimate.kcal ?? recipe.kcal,
    protein_g: estimate.protein_g ?? recipe.protein_g,
    carbs_g: estimate.carbs_g ?? recipe.carbs_g,
    fat_g: estimate.fat_g ?? recipe.fat_g,
    userRequest: recipe.userRequest || row.title,
    saved_recipe_id: row.id,
  };
}

async function renderSavedPlans() {
  const root = document.querySelector("#plan");
  if (!root || !user) return;
  const { data, error } = await sb
    .from("recipes")
    .select("id,title,servings,minutes,recipe,nutrition,created_at")
    .eq("user_id", user.id)
    .eq("is_saved", true)
    .order("updated_at", { ascending: false })
    .limit(6);
  if (error || !data?.length) return;
  const card = document.createElement("article");
  card.className = "card recent-plans";
  card.innerHTML = `<div><p class="eyebrow">YOUR SAVED COOKING PLANS</p><h2>Pick up where you left off.</h2><p>Generated meals stay here after switching tabs or refreshing the page.</p></div><div class="recent-plan-list">${data.map((row, index) => `<article><div><b>${esc(row.title)}</b><small>${window.I18n.code === "zh-TW" ? `${displayNumber(row.minutes)} 分鐘 · ${displayNumber(row.servings)} 人份 · 儲存於 ${esc(displayDate(row.created_at))}` : `${displayNumber(row.minutes, " min")} · ${displayNumber(row.servings, " servings")} · saved ${esc(displayDate(row.created_at))}`}</small></div><button class="dark" data-resume-plan="${index}">Open plan →</button></article>`).join("")}</div>`;
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
    const wanted = String(name || "").trim().toLowerCase();
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
    .map((item) => ({ ...item, ingredientIndex: ingredientIndexFor(item.from) }))
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
  card.innerHTML = `<div class="swaps-heading"><div><p class="eyebrow">PERSONALIZED HEALTHY SWAPS</p><h2>Make this meal work for <em>you.</em></h2><p>Choose any replacements now. Your ingredient list and grocery list will update immediately.</p></div><span class="swap-badge">Profile applied ✓</span></div><div class="swap-grid">${swaps.map((swap, index) => `<article><small>SWAP ${index + 1}</small><b>${esc(swap.from)}</b><i>→</i><strong>${esc(swap.to)}</strong><p>${esc(swap.reason || "A profile-safe alternative for this meal.")}</p><button class="cream" data-apply-swap="${index}">Use this swap</button></article>`).join("")}</div><p class="swap-note">Jarvis avoids your saved allergies and dietary restrictions. Check packaged ingredients when allergies are severe.</p>`;
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
        title: `${window.I18n.code === "zh-TW" ? "購物" : "Shopping"} · ${title}`.slice(0, 120),
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

async function renderShoppingLists() {
  const root = document.querySelector("#shopping");
  if (!root || !user) return;
  const showSavedNotice = shoppingSavedNotice;
  shoppingSavedNotice = false;
  root.innerHTML =
    `<div class="title"><div><p class="eyebrow">AT THE STORE</p><h1>Your shopping<br><em>lists.</em></h1></div></div>${showSavedNotice ? '<div class="shopping-save-notice" role="status"><b>Saved to your grocery list ✓</b><span>The checked ingredients, quantities, and units are ready below.</span></div>' : ""}<div id="saved-shopping-lists"><p>Loading your lists…</p></div>`;
  const { data, error } = await sb
    .from("shopping_lists")
    .select(
      "id,title,status,created_at,shopping_list_items(id,ingredient,quantity,unit,is_checked)",
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
    .map((list) => {
      const items = list.shopping_list_items || [];
      const displayItems = items.map((item) => ({
        ...item,
        grocery: window.ChefDomain.normalizeGroceryItem({
          name: item.ingredient,
          quantity: item.quantity,
          unit: item.unit,
        }),
      }));
      return `<article class="card saved-shopping-list" data-list-id="${esc(list.id)}"><div class="saved-shopping-head"><div><p class="eyebrow">${items.filter((item) => item.is_checked).length} OF ${items.length} PICKED</p><h2>${esc(window.I18n.translate(list.title))}</h2><small>${esc(displayDate(list.created_at))}</small></div><button class="timer-remove" data-delete-list="${esc(list.id)}" aria-label="Delete list">×</button></div><div class="saved-shopping-items">${displayItems.map((item) => `<label class="${item.is_checked ? "checked" : ""}"><input type="checkbox" data-list-item="${esc(item.id)}" ${item.is_checked ? "checked" : ""}><span class="shopping-box">✓</span><b>${esc(item.grocery.name)}</b><small>${item.grocery.quantity == null ? window.I18n.translate("Quantity not specified") : `${esc(item.grocery.quantity)} ${esc(displayShoppingUnit(item.grocery.unit, item.grocery.quantity))}`}</small></label>`).join("")}</div></article>`;
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
        }
      }),
  );
  container.querySelectorAll("[data-delete-list]").forEach(
    (button) =>
      (button.onclick = async (event) => {
        if (!window.confirm("Delete this shopping list?")) return;
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

async function renderUsdaReference(ingredients) {
  const card = document.createElement("article");
  card.className = "card usda-reference";
  card.innerHTML =
    '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>Verifying ingredient nutrition…</h2><p>Jarvis is matching your ingredient list to USDA reference foods in the background.</p>';
  document
    .querySelector("#plan .shopping-checklist")
    .insertAdjacentElement("afterend", card);
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
        body: JSON.stringify({ ingredients }),
      },
    );
    if (!response.ok) throw new Error("USDA lookup unavailable");
    const data = await response.json();
    const foods = (data.foods || []).filter((food) => food.found);
    if (!foods.length) throw new Error("No USDA matches found");
    card.innerHTML = `<p class="eyebrow">USDA FOODDATA CENTRAL · INGREDIENT REFERENCE</p><h2>Per-100 g ingredient data.</h2><p>This is not your meal total. These are independent USDA reference matches.</p><div class="usda-grid">${foods
      .slice(0, 8)
      .map(
        (food) =>
          `<div><b>${esc(food.ingredient)}</b><span>${displayNumber(food.per100g?.kcal)} kcal / 100 g</span><small>P ${displayNumber(food.per100g?.protein_g, "g")} · C ${displayNumber(food.per100g?.carbs_g, "g")} · F ${displayNumber(food.per100g?.fat_g, "g")}</small></div>`,
      )
      .join("")}</div>`;
  } catch {
    card.innerHTML =
      '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>Reference lookup is taking longer.</h2><p>Your plan and grocery list are ready. Try again later to refresh USDA ingredient references.</p>';
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
        is_saved: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    plan.saved_recipe_id = saved.id;
  } catch (error) {
    console.warn("Could not save meal plan", error);
    toast("Your plan is ready, but it could not be saved yet.");
  }
  return plan;
}

function renderCook() {
  const recipe = activeRecipe || {
    title: "Your guided meal",
    ingredients: [],
    steps: fallbackCookingSteps,
    equipment_adaptations: chefEquipmentAdaptations,
  };
  const steps = window.ChefDomain.normalizeRecipeSteps(
    recipe.steps?.length ? recipe.steps : fallbackCookingSteps,
  );
  const adaptations = recipe.equipment_adaptations?.length
    ? recipe.equipment_adaptations
    : chefEquipmentAdaptations;
  cookingStepIndex = Math.max(0, Math.min(cookingStepIndex, steps.length - 1));
  const currentStep = steps[cookingStepIndex];
  const current = currentStep.instruction;
  document.querySelector("#cook").innerHTML = `
    <div class="chef-mode-heading"><div><p class="eyebrow">CHEF MODE · ${activeRecipe ? "ACTIVE RECIPE" : "READY"}</p><h1>${esc(recipe.title)}<br><em>cook with Jarvis.</em></h1></div><button class="cream" id="chef-read">🔊 Read current step</button></div>
    <div class="chef-mode-grid"><section class="chef-guide"><div class="chef-step-counter"><span>STEP ${cookingStepIndex + 1} / ${steps.length}</span><div>${steps.map((_, index) => `<i class="${index < cookingStepIndex ? "done" : index === cookingStepIndex ? "now" : ""}"></i>`).join("")}</div></div><article class="current-step chef-current"><span>DO THIS NOW</span><h2>${esc(current)}</h2>${currentStep.timer ? `<div class="current-step-timer"><b>⏱ ${esc(currentStep.timer.label)}</b><span>${formatTime(currentStep.timer.duration_seconds)}</span></div>` : ""}<p>Only real cooking and waiting times become recipe countdowns. Your progress survives a refresh.</p></article><div class="guide-actions"><button class="cream" id="previous-step" ${cookingStepIndex === 0 ? "disabled" : ""}>← Previous</button><button class="cream" id="repeat-step">↻ Repeat</button><button class="dark" id="complete-step">${cookingStepIndex === steps.length - 1 ? "Finish dish ✓" : "Complete step →"}</button></div><div class="chef-queue"><p class="eyebrow">RECIPE QUEUE</p>${steps.map((step, index) => `<button class="${index === cookingStepIndex ? "current" : index < cookingStepIndex ? "done" : ""}" data-jump-step="${index}"><b>${index < cookingStepIndex ? "✓" : index + 1}</b><span>${esc(step.instruction)}</span></button>`).join("")}</div>${
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
  document.querySelector("#chef-read").onclick = () => sayInstruction(current);
  document.querySelector("#previous-step").onclick = () => {
    cookingStepIndex--;
    persistCookingState();
    renderCook();
  };
  document.querySelector("#repeat-step").onclick = () =>
    sayInstruction(current);
  document.querySelector("#complete-step").onclick = () => {
    if (cookingStepIndex < steps.length - 1) {
      cookingStepIndex++;
      persistCookingState();
      renderCook();
    } else {
      toast("Dish completed — great cooking! ✓");
      sayInstruction(
        /[\u3400-\u9fff]/.test(current)
          ? "料理完成，辛苦了！"
          : "Dish completed. Great cooking.",
      );
      clearCookingState();
      releaseWakeLock();
    }
  };
  document.querySelectorAll("[data-jump-step]").forEach(
    (button) =>
      (button.onclick = () => {
        cookingStepIndex = Number(button.dataset.jumpStep);
        persistCookingState();
        renderCook();
      }),
  );
  document.querySelector("#add-timer").onclick = openClockModal;
  renderTimerList();
}

function openClockModal() {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<form class="modal-card clock-modal" id="clock-form"><p class="eyebrow">ADD A KITCHEN CLOCK</p><h2>Track another task.</h2><div class="form-grid"><div class="field"><label>Task name</label><input name="name" required maxlength="70" placeholder="e.g. Rice resting"></div><div class="field"><label>Clock type</label><select name="mode"><option value="countdown">Countdown</option><option value="stopwatch">Stopwatch</option></select></div><div class="field" id="clock-minutes"><label>Minutes</label><input name="minutes" type="number" min="1" max="240" value="5"></div></div><div class="form-actions"><button type="button" class="cream" id="close-clock">Cancel</button><button class="dark">Add clock →</button></div></form>`;
  document.body.append(modal);
  const form = modal.querySelector("#clock-form");
  form.mode.onchange = () =>
    modal
      .querySelector("#clock-minutes")
      .classList.toggle("hidden", form.mode.value === "stopwatch");
  modal.querySelector("#close-clock").onclick = () => modal.remove();
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
    modal.remove();
    persistCookingState();
    renderTimerList();
  };
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderTimerList() {
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
  list.querySelectorAll("[data-start]").forEach(
    (button) =>
      (button.onclick = async () => {
        const timer = timers[Number(button.dataset.start)];
        if (
          timer.completed ||
          (timer.mode === "countdown" && timer.sec === 0)
        ) {
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
      }),
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
