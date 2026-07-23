// Meal planning, shopping, and Chef Mode live here. app.js owns auth and the shell.
let activeRecipe = null;
let activeRecipeId = null;
let activeRecipeInstanceId = null;
let currentPlan = null;
let currentPlanRecipeId = null;
let currentPlanInstanceId = null;
let menuPlanResults = [];
let nextPlanInstanceId = 0;
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
let timerTickInterval = null;
let lastTimerPersistAt = 0;
let cookingSessionId = null;
let cookingSessionOwnerId = null;
let lastCloudCookingSyncAt = 0;
let cookingCloudSyncChain = Promise.resolve();
let chefStateEpoch = 0;
let cookingStateRevision = 0;
let sessionVoiceTipDismissed = false;
const pendingGenerationControllers = new Set();
const pendingPersistenceControllers = new Set();
const pendingCookingControllers = new Set();
const pendingCookingRestoreControllers = new Set();
const planInstanceIds = new WeakMap();

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

function voiceTipStorageKey() {
  return user ? `chef-jarvis:voice-tip:${user.id}` : null;
}

function isSessionOnlyRecipe(recipe) {
  return recipe?.source_persistence === "session_only";
}

function isEphemeralRecipe(recipe) {
  return (
    isSessionOnlyRecipe(recipe) ||
    !(recipe?.saved_recipe_id || recipe?.id)
  );
}

function isCurrentCookingEphemeral() {
  return Boolean(activeRecipe && isEphemeralRecipe(activeRecipe));
}

function planInstanceIdFor(recipe) {
  if (!recipe || typeof recipe !== "object") return null;
  let instanceId = planInstanceIds.get(recipe);
  if (!instanceId) {
    nextPlanInstanceId += 1;
    instanceId = `plan-${nextPlanInstanceId}`;
    planInstanceIds.set(recipe, instanceId);
  }
  return instanceId;
}

function shouldShowVoiceTip(recipe) {
  if (isSessionOnlyRecipe(recipe)) return !sessionVoiceTipDismissed;
  const voiceTipKey = voiceTipStorageKey();
  return Boolean(voiceTipKey && !localStorage.getItem(voiceTipKey));
}

function dismissVoiceTip(recipe) {
  if (isSessionOnlyRecipe(recipe)) {
    sessionVoiceTipDismissed = true;
    return;
  }
  const voiceTipKey = voiceTipStorageKey();
  if (voiceTipKey) localStorage.setItem(voiceTipKey, "seen");
}

function isCurrentGenerationContext(
  ownerUserId,
  expectedEpoch,
  currentUserId = user?.id || null,
  currentEpoch = chefStateEpoch,
) {
  return (
    Boolean(ownerUserId) &&
    ownerUserId === currentUserId &&
    expectedEpoch === currentEpoch
  );
}

function staleAuthContextError() {
  const error = new Error("The account changed while this recipe was loading.");
  error.code = "stale_auth_context";
  return error;
}

function assertGenerationContext(ownerUserId, expectedEpoch) {
  if (!isCurrentGenerationContext(ownerUserId, expectedEpoch))
    throw staleAuthContextError();
}

function assertCookingContext(ownerUserId, expectedEpoch) {
  if (!isCurrentGenerationContext(ownerUserId, expectedEpoch))
    throw staleAuthContextError();
}

function assertCookingRestoreContext(ownerUserId, expectedEpoch, expectedRevision) {
  if (
    !isCurrentGenerationContext(ownerUserId, expectedEpoch) ||
    expectedRevision !== cookingStateRevision
  )
    throw staleAuthContextError();
}

function invalidateCookingRestores() {
  cookingStateRevision += 1;
  pendingCookingRestoreControllers.forEach((controller) => controller.abort());
  pendingCookingRestoreControllers.clear();
}

function withCookingAbortSignal(query, controller) {
  return typeof query?.abortSignal === "function"
    ? query.abortSignal(controller.signal)
    : query;
}

function cookingStateSnapshot() {
  return {
    activeRecipe,
    activeRecipeId,
    cookingStepIndex,
    timers,
    recipeTimersInitialized,
    savedAt: Date.now(),
  };
}

function queueCookingCloudSync(force = true) {
  if (!user?.id || !activeRecipe || isEphemeralRecipe(activeRecipe)) return;
  const now = Date.now();
  if (!force && now - lastCloudCookingSyncAt < 10000) return;
  lastCloudCookingSyncAt = now;
  const ownerId = user.id;
  const syncEpoch = chefStateEpoch;
  const snapshot = cookingStateSnapshot();
  const controller = new AbortController();
  pendingCookingControllers.add(controller);
  cookingCloudSyncChain = cookingCloudSyncChain
    .catch(() => undefined)
    .then(async () => {
      try {
        assertCookingContext(ownerId, syncEpoch);
        let sessionId =
          cookingSessionOwnerId === ownerId ? cookingSessionId : null;
        if (!sessionId) {
          let lookup = sb
          .from("cooking_sessions")
          .select("id")
          .eq("user_id", ownerId)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1);
          lookup = withCookingAbortSignal(lookup, controller);
          assertCookingContext(ownerId, syncEpoch);
          const { data, error } = await lookup.maybeSingle();
          assertCookingContext(ownerId, syncEpoch);
          if (error) throw error;
          sessionId = data?.id || null;
          if (sessionId) {
            assertCookingContext(ownerId, syncEpoch);
            cookingSessionId = sessionId;
            cookingSessionOwnerId = ownerId;
          }
        }
        const payload = {
          user_id: ownerId,
          app_user_id: ownerId,
          recipe_id: snapshot.activeRecipeId || null,
          status: "active",
          current_step: snapshot.cookingStepIndex,
          timers: snapshot.timers,
          timeline: {
            activeRecipe: snapshot.activeRecipe,
            recipeTimersInitialized: snapshot.recipeTimersInitialized,
            savedAt: snapshot.savedAt,
          },
          updated_at: new Date().toISOString(),
        };
        if (sessionId) {
          let update = sb
          .from("cooking_sessions")
          .update(payload)
          .eq("id", cookingSessionId)
          .eq("user_id", ownerId);
          update = withCookingAbortSignal(update.select("id"), controller);
          assertCookingContext(ownerId, syncEpoch);
          const { data, error } = await update;
          assertCookingContext(ownerId, syncEpoch);
          if (error) throw error;
          if (data?.[0]?.id) return;
          if (cookingSessionOwnerId === ownerId) {
            cookingSessionId = null;
            cookingSessionOwnerId = null;
          }
          sessionId = null;
        }
        let insert = sb
        .from("cooking_sessions")
        .insert({ ...payload, started_at: new Date().toISOString() })
        .select("id");
        insert = withCookingAbortSignal(insert, controller);
        assertCookingContext(ownerId, syncEpoch);
        const { data, error } = await insert.single();
        assertCookingContext(ownerId, syncEpoch);
        if (error) throw error;
        assertCookingContext(ownerId, syncEpoch);
        cookingSessionId = data.id;
        cookingSessionOwnerId = ownerId;
      } finally {
        pendingCookingControllers.delete(controller);
      }
    })
    .catch((error) => {
      if (error?.code === "stale_auth_context" || controller.signal.aborted)
        return;
      console.warn("Could not sync cooking progress", error);
    });
}

function finishCloudCookingSession(status) {
  if (!user?.id || isEphemeralRecipe(activeRecipe)) return;
  const ownerId = user.id;
  const syncEpoch = chefStateEpoch;
  const sessionId =
    cookingSessionOwnerId === ownerId ? cookingSessionId : null;
  if (cookingSessionOwnerId === ownerId) {
    cookingSessionId = null;
    cookingSessionOwnerId = null;
  }
  const controller = new AbortController();
  pendingCookingControllers.add(controller);
  cookingCloudSyncChain = cookingCloudSyncChain
    .catch(() => undefined)
    .then(async () => {
      try {
        assertCookingContext(ownerId, syncEpoch);
        let query = sb
        .from("cooking_sessions")
        .update({
          status,
          completed_at: status === "completed" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        });
      query = sessionId
        ? query.eq("id", sessionId).eq("user_id", ownerId)
        : query.eq("user_id", ownerId).eq("status", "active");
        query = withCookingAbortSignal(query, controller);
        assertCookingContext(ownerId, syncEpoch);
        const { error } = await query;
        assertCookingContext(ownerId, syncEpoch);
        if (error) throw error;
      } finally {
        pendingCookingControllers.delete(controller);
      }
    })
    .catch((error) => {
      if (error?.code === "stale_auth_context" || controller.signal.aborted)
        return;
      console.warn("Could not close cloud cooking progress", error);
    });
}

function persistCookingState(forceCloud = true) {
  const key = cookingStorageKey();
  if (!key) return;
  if (isEphemeralRecipe(activeRecipe)) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(cookingStateSnapshot()));
  lastTimerPersistAt = Date.now();
  queueCookingCloudSync(forceCloud);
}

function reconcileStrictRecipeTimers(recipe, savedTimers = []) {
  const expectedTimers = window.ChefDomain.buildRecipeTimers(recipe?.steps);
  const usedSavedIndexes = new Set();
  const recipeTimers = expectedTimers.map((expected) => {
    const savedIndex = savedTimers.findIndex((saved, index) => {
      if (usedSavedIndexes.has(index) || saved.source !== "recipe") return false;
      const exactSequence =
        saved.stepIndex === expected.stepIndex &&
        saved.stepTimerIndex === expected.stepTimerIndex;
      const legacyMatch =
        saved.stepIndex === expected.stepIndex &&
        saved.duration === expected.duration &&
        saved.name === expected.name;
      return exactSequence || legacyMatch;
    });
    if (savedIndex < 0) return expected;
    usedSavedIndexes.add(savedIndex);
    const saved = savedTimers[savedIndex];
    return {
      ...expected,
      sec: Math.max(0, finiteNumber(saved.sec, expected.duration)),
      running: Boolean(saved.running),
      completed: Boolean(saved.completed),
    };
  });
  return [
    ...savedTimers.filter((timer) => timer.source !== "recipe"),
    ...recipeTimers,
  ];
}

function restoreCookingState() {
  const key = cookingStorageKey();
  if (!key) return;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved?.activeRecipe) return;
    if (isEphemeralRecipe(saved.activeRecipe)) {
      localStorage.removeItem(key);
      return;
    }
    activeRecipe = saved.activeRecipe;
    activeRecipeId =
      saved.activeRecipeId || saved.activeRecipe.saved_recipe_id || null;
    cookingStepIndex = Math.max(0, Number(saved.cookingStepIndex) || 0);
    const savedTimers = Array.isArray(saved.timers)
      ? saved.timers.map((timer) => ({
          ...timer,
          sec: Math.max(0, finiteNumber(timer.sec, 0)),
          duration: Math.max(0, finiteNumber(timer.duration, 0)),
          completed: Boolean(timer.completed),
          running: Boolean(timer.running),
        }))
      : [];
    timers = reconcileStrictRecipeTimers(activeRecipe, savedTimers);
    recipeTimersInitialized = true;
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
    lastTimerTick = Date.now();
    syncTimerTicker();
  } catch (error) {
    console.warn("Could not restore cooking progress", error);
    localStorage.removeItem(key);
  }
}

async function restoreCookingStateFromCloud() {
  if (!user?.id) return;
  const ownerId = user.id;
  const syncEpoch = chefStateEpoch;
  const cookingRevision = cookingStateRevision;
  const controller = new AbortController();
  pendingCookingControllers.add(controller);
  pendingCookingRestoreControllers.add(controller);
  try {
    let lookup = sb
      .from("cooking_sessions")
      .select("id,recipe_id,current_step,timers,timeline,updated_at")
      .eq("user_id", ownerId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);
    lookup = withCookingAbortSignal(lookup, controller);
    assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
    const { data, error } = await lookup.maybeSingle();
    assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
    if (error) {
      console.warn("Could not restore cloud cooking progress", error);
      return;
    }
    if (!data) {
      assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
      if (activeRecipe && !isEphemeralRecipe(activeRecipe))
        queueCookingCloudSync(true);
      return;
    }
    const remote = data.timeline && !Array.isArray(data.timeline)
      ? data.timeline
      : {};
    if (!remote.activeRecipe) return;
    const key = cookingStorageKey();
    if (isEphemeralRecipe(remote.activeRecipe)) {
      let scrub = sb
      .from("cooking_sessions")
      .delete()
      .eq("id", data.id)
        .eq("user_id", ownerId);
      scrub = withCookingAbortSignal(scrub, controller);
      assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
      const { error: scrubError } = await scrub;
      assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
      if (scrubError)
        console.warn("Could not scrub stale cooking session", scrubError);
      return;
    }
    let local = null;
    try {
      local = JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      local = null;
    }
    if (finiteNumber(local?.savedAt, 0) >= finiteNumber(remote.savedAt, 0))
      return;
    assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
    cookingSessionId = data.id;
    cookingSessionOwnerId = ownerId;
    assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
    localStorage.setItem(
      key,
      JSON.stringify({
        activeRecipe: remote.activeRecipe,
        activeRecipeId: data.recipe_id || remote.activeRecipe.saved_recipe_id || null,
        cookingStepIndex: Math.max(0, Number(data.current_step) || 0),
        timers: Array.isArray(data.timers) ? data.timers : [],
        recipeTimersInitialized: Boolean(remote.recipeTimersInitialized),
        savedAt: finiteNumber(remote.savedAt, Date.now()),
      }),
    );
    assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
    restoreCookingState();
    assertCookingRestoreContext(ownerId, syncEpoch, cookingRevision);
    if (document.querySelector("#cook")?.classList.contains("active"))
      renderCook();
  } catch (error) {
    if (error?.code !== "stale_auth_context" && !controller.signal.aborted)
      console.warn("Could not restore cloud cooking progress", error);
  } finally {
    pendingCookingControllers.delete(controller);
    pendingCookingRestoreControllers.delete(controller);
  }
}

function clearCookingState(status = "abandoned") {
  invalidateCookingRestores();
  if (!isEphemeralRecipe(activeRecipe)) finishCloudCookingSession(status);
  const key = cookingStorageKey();
  if (key) localStorage.removeItem(key);
  activeRecipe = null;
  activeRecipeId = null;
  activeRecipeInstanceId = null;
  cookingStepIndex = 0;
  timers = [];
  recipeTimersInitialized = false;
  stopTimerTicker();
}

function resetChefModeState() {
  chefStateEpoch += 1;
  invalidateCookingRestores();
  pendingGenerationControllers.forEach((controller) => controller.abort());
  pendingGenerationControllers.clear();
  pendingPersistenceControllers.forEach((controller) => controller.abort());
  pendingPersistenceControllers.clear();
  pendingCookingControllers.forEach((controller) => controller.abort());
  pendingCookingControllers.clear();
  sessionVoiceTipDismissed = false;
  activeRecipe = null;
  activeRecipeId = null;
  activeRecipeInstanceId = null;
  currentPlan = null;
  currentPlanRecipeId = null;
  currentPlanInstanceId = null;
  menuPlanResults = [];
  cookingStepIndex = 0;
  timers = [];
  recipeTimersInitialized = false;
  cookingSessionId = null;
  cookingSessionOwnerId = null;
  lastCloudCookingSyncAt = 0;
  cookingCloudSyncChain = Promise.resolve();
  chefEquipmentAdaptations = [];
  shoppingSavedNotice = false;
  stopTimerTicker();
  stopVoiceControl();
  window.speechSynthesis?.cancel();
}

window.resetChefModeState = resetChefModeState;

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

function hasCookingProgress() {
  if (!activeRecipe) return false;
  return (
    cookingStepIndex > 0 ||
    timers.some(
      (timer) =>
        timer.running ||
        timer.completed ||
        (timer.mode === "countdown" && timer.sec < timer.duration) ||
        (timer.mode === "stopwatch" && timer.sec > 0),
    )
  );
}

async function beginGuidedCooking(
  recipe,
  ingredients,
  recipeId,
  planInstanceId = currentPlanInstanceId,
) {
  if (
    hasCookingProgress() &&
    !(await confirmAction({
      title: "Replace the current cooking session?",
      message: `You are still cooking “${activeRecipe.title}”. Starting another recipe will reset its step and timers.`,
      confirmLabel: "Start new recipe",
    }))
  )
    return false;
  invalidateCookingRestores();
  if (activeRecipe && !isEphemeralRecipe(activeRecipe))
    finishCloudCookingSession("abandoned");
  activeRecipe = {
    ...recipe,
    ingredients,
    saved_recipe_id: recipeId || recipe.saved_recipe_id || null,
  };
  activeRecipeId = activeRecipe.saved_recipe_id;
  activeRecipeInstanceId = planInstanceId;
  cookingStepIndex = 0;
  timers = window.ChefDomain.buildRecipeTimers(recipe.steps);
  recipeTimersInitialized = true;
  syncTimerTicker();
  persistCookingState();
  renderCook();
  show("cook");
  return true;
}

function ingredientVisual(item = {}) {
  const name = String(item.name || "").toLocaleLowerCase();
  const category = String(item.category || "").toLocaleLowerCase();
  const matches = (pattern) => pattern.test(name);
  if (matches(/avocado|酪梨|牛油果/)) return "🥑";
  if (matches(/broccoli|花椰菜|西蘭花/)) return "🥦";
  if (matches(/carrot|紅蘿蔔|胡蘿蔔/)) return "🥕";
  if (matches(/bell pepper|capsicum|甜椒|彩椒|青椒/)) return "🫑";
  if (matches(/chili|pepper flakes|辣椒/)) return "🌶️";
  if (matches(/tomato|番茄|蕃茄/)) return "🍅";
  if (matches(/cucumber|小黃瓜|黃瓜/)) return "🥒";
  if (matches(/lemon|檸檬|柠檬/)) return "🍋";
  if (matches(/lime|萊姆|青檸/)) return "🍈";
  if (matches(/water|清水|水$/)) return "💧";
  if (matches(/vinegar|醋/)) return "🫙";
  if (matches(/cornstarch|starch|flour|太白粉|玉米粉|麵粉/)) return "🌾";
  if (matches(/peppercorn|花椒/)) return "⚫";
  if (matches(/peanut|花生/)) return "🥜";
  if (matches(/green pea|peas|豌豆|青豆/)) return "🫛";
  if (matches(/ginger|薑|姜/)) return "🫚";
  if (matches(/scallion|green onion|青蔥|蔥/)) return "🌿";
  if (matches(/garlic|蒜/)) return "🧄";
  if (matches(/onion|洋蔥|蔥頭/)) return "🧅";
  if (matches(/potato|馬鈴薯|土豆/)) return "🥔";
  if (matches(/mushroom|蘑菇|香菇/)) return "🍄";
  if (matches(/corn|玉米/)) return "🌽";
  if (matches(/eggplant|茄子/)) return "🍆";
  if (matches(/leaf|lettuce|spinach|basil|parsley|herb|青菜|生菜|菠菜|羅勒|巴西里|香草/))
    return "🌿";
  if (matches(/chicken breast|雞胸/)) return "🍗";
  if (matches(/chicken|雞腿|雞肉/)) return "🍗";
  if (matches(/beef|steak|牛肉|牛排/)) return "🥩";
  if (matches(/pork|豬肉|豬排/)) return "🥩";
  if (matches(/salmon|鮭魚/)) return "🐟";
  if (matches(/fish|cod|tuna|魚|鱈魚|鮪魚/)) return "🐟";
  if (matches(/shrimp|prawn|蝦/)) return "🦐";
  if (matches(/tofu|豆腐/)) return "◻️";
  if (matches(/egg|雞蛋|蛋/)) return "🥚";
  if (matches(/milk|cream|yogurt|cheese|牛奶|鮮奶油|優格|乳酪|起司/))
    return "🥛";
  if (matches(/oil|olive oil|酪梨油|橄欖油|食用油|芝麻油|麻油/))
    return "🫗";
  if (matches(/rice|米飯|白米|糙米/)) return "🍚";
  if (matches(/bread|toast|sourdough|麵包|吐司/)) return "🍞";
  if (matches(/pasta|noodle|義大利麵|麵條/)) return "🍝";
  if (matches(/chickpea|bean|lentil|鷹嘴豆|豆類|扁豆/)) return "🫘";
  if (matches(/salt|鹽/)) return "🧂";
  if (matches(/pepper|胡椒/)) return "⚫";
  if (matches(/soy sauce|醬油|酱油/)) return "🥣";
  if (matches(/sugar|honey|糖|蜂蜜/)) return "🍯";
  return {
    protein: "🍗",
    produce: "🥬",
    grain: "🌾",
    dairy: "🥛",
    seasoning: "🧂",
    oil: "🫗",
  }[category] || "🍽️";
}

function stepVisual(step = {}, index = 0) {
  const instruction = String(step.instruction || "").toLocaleLowerCase();
  if (/preheat|heat the|熱鍋|預熱|加熱/.test(instruction)) return "🔥";
  if (/slice|dice|chop|mince|cut|切|切片|切丁|剁碎/.test(instruction))
    return "🔪";
  if (/mix|whisk|stir|combine|拌|攪拌|混合/.test(instruction)) return "🥣";
  if (/boil|simmer|煮沸|燉煮|水煮/.test(instruction)) return "♨️";
  if (/bake|roast|air.?fry|烘烤|烤箱|氣炸/.test(instruction)) return "♨️";
  if (/sear|sauté|fry|cook|煎|炒|烹煮/.test(instruction)) return "🍳";
  if (/rest|cool|chill|靜置|放涼|冷藏/.test(instruction)) return "⏲️";
  if (/plate|serve|garnish|裝盤|上桌|點綴/.test(instruction)) return "🍽️";
  return ["🥄", "🧑‍🍳", "✨"][index % 3];
}

function renderRecipeStepCards(steps = []) {
  return steps
    .map((step, index) => {
      const timers = Array.isArray(step.timers) ? step.timers : [];
      const timerMarkup = timers.length
        ? `<span class="step-timing">${timers
            .map((timer) => `⏱ ${formatTime(timer.duration_seconds)}`)
            .join(" · ")}</span>`
        : "";
      return `<li><span class="step-number">${index + 1}</span><span class="step-visual" aria-hidden="true">${stepVisual(step, index)}</span><b>${esc(step.instruction)}</b>${timerMarkup}</li>`;
    })
    .join("");
}

function safeHttpsSourceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function recipeSourceMarkup(recipe) {
  const sourceType = String(recipe.source_type || "");
  const isAdapted = recipe.source_type === "adapted";
  if (sourceType === "ai_generated") {
    return `<p class="recipe-source-note">${esc(window.I18n.translate("Generated by Chef Jarvis"))}</p>`;
  }
  if (sourceType !== "external" && sourceType !== "adapted") return "";
  const title = String(recipe.source_title || "").trim();
  const url = safeHttpsSourceUrl(recipe.source_url);
  if (!title || !url) return "";
  const label = window.I18n.translate(
    isAdapted ? "Adapted from" : "Source recipe",
  );
  return `<p class="recipe-source-note"><span>${esc(label)}</span> <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></p>`;
}

function renderPlan(query) {
  markViewRendered("plan");
  const root = document.querySelector("#plan");
  if (!root) return;
  const renderVersion = ++planRenderVersion;
  const isAi = query && typeof query === "object";
  const planInstanceId = isAi ? planInstanceIdFor(query) : null;
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
            : [],
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
        source_type: query.source_type || "",
        source_provider: query.source_provider || "",
        source_title: query.source_title || "",
        source_url: query.source_url || "",
        source_persistence: query.source_persistence || "permanent",
        persistence_notice: query.persistence_notice || "",
      }
    : recipeFor(typeof query === "string" ? query : undefined);
  recipe.steps = window.ChefDomain.normalizeRecipeSteps(recipe.steps);
  const integrity = window.ChefDomain.recipeIntegrityReport(recipe);
  if (!recipe.steps.length) {
    recipe.steps = window.ChefDomain.normalizeRecipeSteps(fallbackCookingSteps);
  }
  const integrityDisabled = integrity.safe ? "" : "disabled";
  const integrityWarning = integrity.safe
    ? ""
    : `<article class="legacy-recipe-warning card" role="alert"><div><p class="eyebrow">RECIPE NEEDS REVIEW</p><h2>This legacy recipe is missing exact ingredient measurements.</h2><p>For safe cooking and reliable pantry updates, generate a new measured version before continuing.</p></div><button class="dark" id="regenerate-precise-recipe">Regenerate precise recipe →</button></article>`;
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
  const canSaveReuseIdeas = !isSessionOnlyRecipe(recipe);
  if (planInstanceId) planInstanceIds.set(recipe, planInstanceId);
  currentPlan = isAi ? recipe : null;
  currentPlanRecipeId = recipe.saved_recipe_id || null;
  currentPlanInstanceId = planInstanceId;
  chefEquipmentAdaptations = recipe.equipment_adaptations;
  const displayImage =
    window.ChefDomain.curatedRecipeImage(recipe) || recipe.image;
  const imageUrl = window.ChefDomain.safeExternalUrl(displayImage?.url, [
    "wikimedia.org",
    "themealdb.com",
  ]);
  const imageSourceUrl = window.ChefDomain.safeExternalUrl(
    displayImage?.description_url,
    ["wikimedia.org", "themealdb.com"],
  );
  const imageMatchLabel =
    displayImage?.match_kind === "representative"
      ? '<span class="recipe-image-match-label">Representative dish image</span> · '
      : displayImage?.match_kind === "curated"
        ? '<span class="recipe-image-match-label">Curated dish image</span> · '
        : "";
  const sourceNote = recipeSourceMarkup(recipe);
  const recipeVisual = imageUrl
    ? `<div class="recipe-photo dish-visual has-recipe-image"><img class="recipe-image" src="${esc(imageUrl)}" alt="${esc(recipe.title)}" loading="lazy">${imageSourceUrl ? `<a class="recipe-image-credit" href="${esc(imageSourceUrl)}" target="_blank" rel="noopener noreferrer">${imageMatchLabel}${esc(displayImage.source || "Wikimedia Commons")} · ${esc(displayImage.creator || "Commons contributor")} · ${esc(displayImage.license || "See source")}</a>` : ""}</div>`
    : `<div class="recipe-photo dish-visual"><div class="recipe-photo-empty"><span>YOUR DISH</span><b>${esc(recipe.title)}</b><small>Ingredients and cooking steps below</small></div></div>`;
  root.innerHTML = `
    <div class="title"><div><p class="eyebrow">PERSONAL MEAL PLANNER</p><h1>${isAi ? "Your meal is" : "Let’s make something"}<br><em>${isAi ? "ready." : "great."}</em></h1></div><button class="dark" id="new-meal">＋ New meal</button></div>
    ${integrityWarning}
    <div class="planner recipe-plan-layout">
      <article class="recipe recipe-showcase card"><div class="recipe-body"><div class="recipe-personalized-note"><span>✦</span><div><b>Made for your profile</b><small>Pantry, nutrition and preferences applied</small></div></div><p class="eyebrow">CHEF JARVIS PLAN</p><h2 class="${recipe.title.length > 48 ? "long-title" : ""}">${esc(recipe.title)}</h2><p class="recipe-summary">${esc(recipe.summary)}</p>${sourceNote}<p class="recipe-request">${esc(isAi ? query.userRequest : query || "Tell Jarvis what you would like to cook.")}</p><div class="recipe-facts"><span>◷ ${displayNumber(recipe.minutes)} min</span><span>◌ ${displayNumber(recipe.servings)} servings</span></div><div class="macros"><div><b>${displayNumber(recipe.kcal)}</b><small>est. kcal · whole meal</small></div><div><b>${displayNumber(recipe.protein_g, "g")}</b><small>est. protein · whole meal</small></div><div><b>${displayNumber(recipe.carbs_g, "g")}</b><small>est. carbs · whole meal</small></div><div><b>${displayNumber(recipe.fat_g, "g")}</b><small>est. fat · whole meal</small></div></div><div class="recipe-primary-actions"><button class="cream" id="jump-to-ingredients">Review ingredients ↓</button><button class="dark" id="start-guided-cook" ${isAi ? integrityDisabled : "disabled"}>Start guided cooking →</button></div><p class="meal-estimate-note"><b>Meal estimate</b> · Whole recipe (${displayNumber(recipe.servings)} servings). Adjust it after changing quantities or swaps.</p></div>${recipeVisual}</article>
    </div>
    <div class="guided-preview"><article class="card step-guide"><div class="section-heading"><div><p class="eyebrow">HOW JARVIS WILL GUIDE YOU</p><h2>${recipe.steps.length} clear cooking steps</h2></div><p>Scan the full flow now, then start Chef Mode for hands-free guidance and recipe-based timers.</p></div><ol>${renderRecipeStepCards(recipe.steps)}</ol></article></div>
    <article class="reuse card"><p class="eyebrow">SHOP ONCE, COOK MORE</p><h2>Ideas using your remaining ingredients.</h2><div class="swipe-list">${reuse
      .slice(0, 3)
      .map(
        (item) =>
          `<article class="meal-card"><h3>${esc(item.title)}</h3><p>${esc(item.why || (item.uses || []).join(" · "))}</p>${canSaveReuseIdeas ? `<button class="save" data-save="${esc(item.title)}" data-uses="${esc((item.uses || []).join("|"))}">Save for week →</button>` : '<small>This sourced recipe is available for this session only.</small>'}</article>`,
      )
      .join("")}</div></article>`;

  document.querySelector("#new-meal").onclick = () => show("home");
  root
    .querySelector("#regenerate-precise-recipe")
    ?.addEventListener("click", () => {
      show("home");
      const mealInput = document.querySelector("#meal-input");
      if (!mealInput) return;
      mealInput.value =
        window.I18n.code === "zh-TW"
          ? `請為「${recipe.title}」建立食材與份量完整精確的食譜`
          : `Create a precise, fully measured recipe for ${recipe.title}`;
      mealInput.focus();
    });
  document.querySelector("#jump-to-ingredients").onclick = () =>
    root
      .querySelector(".shopping-checklist")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#start-guided-cook").onclick = () =>
    beginGuidedCooking(
      recipe,
      ingredients,
      currentPlanRecipeId,
      currentPlanInstanceId,
    );
  document.querySelectorAll("[data-save]").forEach(
    (button) =>
      (button.onclick = async () => {
        const saved = await saveCard(
          button.dataset.save,
          button.dataset.uses.split("|").filter(Boolean),
          "Saved from your AI meal plan",
          recipe.title,
        );
        if (!saved) return;
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
    const swapsCard = renderPersonalizedSwaps(
      recipe,
      async (ingredientIndex, swap) => {
      const stepUpdates = Array.isArray(swap.step_updates)
        ? swap.step_updates
        : [];
      const sourceName = String(swap.from || "").toLocaleLowerCase();
      const affectedStepIndexes = recipe.steps
        .map((step, stepIndex) =>
          String(step.instruction || "")
            .toLocaleLowerCase()
            .includes(sourceName)
            ? stepIndex
            : -1,
        )
        .filter((stepIndex) => stepIndex >= 0);
      const updatedStepIndexes = new Set(
        stepUpdates.map((update) => Number(update.step_index)),
      );
      if (
        !stepUpdates.length ||
        affectedStepIndexes.some((stepIndex) => !updatedStepIndexes.has(stepIndex))
      ) {
        toast(
          "This replacement does not include safe cooking-step updates. Generate a fresh plan before applying it.",
        );
        return false;
      }
      const replacement = window.ChefDomain.applyIngredientSubstitution(
        recipe.ingredients[ingredientIndex],
        swap,
      );
      const updatedTitle = window.ChefDomain.recipeTitleAfterSubstitution(
        recipe.title,
        swap.from,
        replacement.name,
      );
      recipe.title = updatedTitle;
      recipe.ingredients[ingredientIndex] = replacement;
      ingredients[ingredientIndex] = replacement;
      if (currentPlan) {
        currentPlan.title = updatedTitle;
        currentPlan.ingredients = recipe.ingredients;
      }
      stepUpdates.forEach((update) => {
        const stepIndex = Number(update.step_index);
        const normalized = window.ChefDomain.normalizeRecipeSteps([update])[0];
        if (
          Number.isInteger(stepIndex) &&
          stepIndex >= 0 &&
          stepIndex < recipe.steps.length &&
          normalized
        ) {
          recipe.steps[stepIndex] = normalized;
        }
      });
      if (currentPlan) currentPlan.steps = recipe.steps;

      shoppingChecklist?.updateIngredient(ingredientIndex, replacement);
      shoppingChecklist?.updateTitle(updatedTitle);
      const recipeHeading = root.querySelector(".recipe-body h2");
      if (recipeHeading) recipeHeading.textContent = updatedTitle;
      const placeholderTitle = root.querySelector(".dish-visual b");
      if (placeholderTitle) placeholderTitle.textContent = updatedTitle;
      const recipeImage = root.querySelector(".recipe-image");
      if (recipeImage) recipeImage.alt = updatedTitle;
      renderUsdaReference(recipe, { force: true });

      const stepGuide = root.querySelector(".step-guide");
      if (stepGuide) {
        stepGuide.querySelector("h2").textContent =
          `${recipe.steps.length} clear cooking steps`;
        stepGuide.querySelector("ol").innerHTML =
          renderRecipeStepCards(recipe.steps);
      }

      const cookingWarning = root.querySelector(".swap-cooking-warning");
      if (cookingWarning) {
        cookingWarning.classList.remove("hidden");
        cookingWarning.textContent =
          "Ingredient quantities, grocery items, cooking steps, and recipe timers were updated together ✓";
      }

      if (currentPlanRecipeId && recipe.source_persistence !== "session_only") {
        const { error } = await sb
          .from("recipes")
          .update({ recipe: currentPlan || recipe })
          .eq("id", currentPlanRecipeId)
          .eq("user_id", user.id);
        if (error) {
          toast("The swap is applied here, but could not be saved yet.");
          return true;
        }
      }
      toast(`${replacement.name} is now in your ingredient list ✓`);
      return true;
      },
    );
    if (!swapsCard && !query.fallback) {
      const notice = document.createElement("article");
      notice.className = "card swap-unavailable-note";
      notice.innerHTML = `<p class="eyebrow">INGREDIENT SWAPS</p><h2>No fully verified swap is available for this plan.</h2><p>Jarvis removed an incomplete replacement instead of leaving the grocery list and cooking steps inconsistent. Generate another plan if you need a substitution.</p>`;
      root
        .querySelector(".guided-preview")
        .insertAdjacentElement("beforebegin", notice);
    }
    shoppingChecklist = renderShoppingChecklist(
      recipe.title,
      recipe.ingredients,
      integrity,
      { allowPersistence: !isSessionOnlyRecipe(recipe) },
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
  if (!title) return;
  const controls = document.createElement("div");
  controls.className = "plan-persistence-controls";
  if (recipe.source_persistence === "session_only") {
    controls.innerHTML = `<span><b>${esc(recipe.persistence_notice || window.I18n.translate("This sourced recipe is available in this session and was not stored."))}</b><small>${esc(window.I18n.translate("Cook later is unavailable because this source cannot be saved."))}</small></span>`;
    title.append(controls);
    return;
  }
  controls.innerHTML = recipe.is_saved
    ? "<span>Saved to your recipes ✓</span>"
    : `<span><b>Not saved yet</b><small>${esc(window.I18n.translate("Until you select Cook later, this plan stays only in this browser session and is lost on refresh."))}</small></span><button class="cream" id="cook-later">Cook later</button>`;
  title.append(controls);
  const button = controls.querySelector("#cook-later");
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      if (!currentPlanRecipeId) {
        await saveGeneratedPlanForLater(recipe, currentPlanInstanceId);
      } else {
        const { error } = await sb
          .from("recipes")
          .update({ is_saved: true, updated_at: new Date().toISOString() })
          .eq("id", currentPlanRecipeId)
          .eq("user_id", user.id);
        if (error) throw error;
        recipe.is_saved = true;
        if (currentPlan) currentPlan.is_saved = true;
      }
    } catch (error) {
      if (error?.code === "stale_auth_context") return;
      button.disabled = false;
      button.textContent = "Cook later";
      return toast(error.message);
    }
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
  const expectedRenderVersion = planRenderVersion;
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
  if (expectedRenderVersion !== planRenderVersion) return true;
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
  if (!error && cacheKey) {
    localStorage.setItem(cacheKey, JSON.stringify(data || []));
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
        if (cacheKey) {
          localStorage.setItem(
            cacheKey,
            JSON.stringify(data.filter((candidate) => candidate.id !== row.id)),
          );
        }
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
  if (error) {
    toast(error.message);
    return false;
  }
  toast("Saved to next week’s meal folder ✓");
  return true;
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
  markViewRendered("week");
  const root = document.querySelector("#week");
  if (!root || !user) return;
  const weekStart = currentWeekStart();
  const weekStartKey = dateKey(weekStart);
  root.innerHTML = `<div class="title"><div><p class="eyebrow">WEEKLY PLANNER</p><h1>Shop once,<br><em>cook all week.</em></h1></div><button class="dark" id="build-week-list" disabled>Build weekly grocery list →</button></div><div class="weekly-howto" aria-label="How weekly planning works"><span><b>① Save a recipe</b>Choose “Cook later” on a recipe you like.</span><span><b>② Pick a day</b>Add saved recipes to your week.</span><span><b>③ Shop once</b>Merge the full week into one grocery list.</span></div><div class="weekly-grid"><article class="card weekly-loading"><p>Loading your week…</p></article></div>`;
  let { data: plan, error: planError } = await sb
    .from("meal_plans")
    .select("id,week_start")
    .eq("user_id", user.id)
    .eq("week_start", weekStartKey)
    .maybeSingle();
  if (planError) {
    root.querySelector(".weekly-grid").innerHTML =
      `<article class="card weekly-loading"><h2>Could not load this week.</h2><p>${esc(planError.message)}</p></article>`;
    return;
  }
  async function ensureWeekPlan() {
    if (plan) return plan;
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
    if (result.error) throw result.error;
    plan = result.data;
    return plan;
  }
  const [itemsResult, recipesResult, ideasResult] = await Promise.all([
      plan
        ? sb
            .from("meal_plan_items")
            .select("id,recipe_id,scheduled_for,meal_type,servings,notes")
            .eq("meal_plan_id", plan.id)
            .order("scheduled_for")
        : Promise.resolve({ data: [], error: null }),
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
  const loadError =
    itemsResult.error || recipesResult.error || ideasResult.error || null;
  if (loadError) {
    renderedViews.delete("week");
    root.querySelector(".weekly-grid").innerHTML =
      `<article class="card weekly-loading"><h2>Could not load your weekly plan.</h2><p>${esc(loadError.message)}</p><button class="cream" data-retry-week>Retry →</button></article>`;
    root.querySelector("[data-retry-week]").onclick = renderWeeklyPlanner;
    return;
  }
  const items = itemsResult.data;
  const recipes = recipesResult.data;
  const ideas = ideasResult.data;
  const recipeRows = recipes || [];
  const schedule = items || [];
  const recipeMap = new Map(recipeRows.map((recipe) => [recipe.id, recipe]));
  const unsafeWeeklyRecipes = schedule
    .map((item) => recipeMap.get(item.recipe_id))
    .filter(
      (recipeRow) =>
        !recipeRow?.recipe ||
        !window.ChefDomain.recipeIntegrityReport(recipeRow.recipe).safe,
    );
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
  listButton.disabled = !schedule.length || unsafeWeeklyRecipes.length > 0;
  if (unsafeWeeklyRecipes.length) {
    const notice = document.createElement("p");
    notice.className = "legacy-list-warning";
    notice.setAttribute("role", "alert");
    notice.textContent =
      "One or more scheduled recipes are missing exact ingredients or cooking steps. Regenerate those recipes before building a weekly list.";
    root
      .querySelector(".weekly-howto")
      .insertAdjacentElement("afterend", notice);
  }
  listButton.onclick = async () => {
    if (unsafeWeeklyRecipes.length) {
      return toast(
        "Regenerate those recipes before building a weekly list.",
      );
    }
    const scheduledIngredients = schedule.flatMap((item) => {
      const recipeRow = recipeMap.get(item.recipe_id);
      if (!recipeRow?.recipe) return [];
      return window.ChefDomain.scaleIngredientsForServings(
        recipeRow.recipe.ingredients || [],
        item.servings,
        recipeRow.servings ?? recipeRow.recipe.servings,
      );
    });
    listButton.disabled = true;
    listButton.textContent = "Merging ingredients…";
    try {
      const count = await saveMergedShoppingList(
        `${window.I18n.code === "zh-TW" ? "本週購物" : "Weekly groceries"} · ${weekStartKey}`,
        scheduledIngredients,
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
        try {
          const activePlan = await ensureWeekPlan();
          const payload = {
            meal_plan_id: activePlan.id,
            recipe_id: recipeId,
            scheduled_for: dayCard.dataset.weekDay,
            meal_type: "dinner",
            servings: finiteNumber(selectedRecipe?.servings, 2),
          };
          const query = existing
            ? sb.from("meal_plan_items").update(payload).eq("id", existing.id)
            : sb.from("meal_plan_items").insert(payload);
          const { error } = await query;
          if (error) throw error;
          toast("Meal added to your week ✓");
          renderWeeklyPlanner();
        } catch (error) {
          toast(error.message || "Could not update your week.");
        }
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
    .filter(
      (item) => {
        if (
          !item?.from ||
          !item?.to ||
          !Array.isArray(item.step_updates) ||
          !item.step_updates.length
        )
          return false;
        const sourceName = String(item.from).toLocaleLowerCase();
        const affectedStepIndexes = recipe.steps
          .map((step, stepIndex) =>
            String(step.instruction || "")
              .toLocaleLowerCase()
              .includes(sourceName)
              ? stepIndex
              : -1,
          )
          .filter((stepIndex) => stepIndex >= 0);
        const updatedStepIndexes = new Set(
          item.step_updates.map((update) => Number(update.step_index)),
        );
        return affectedStepIndexes.every((stepIndex) =>
          updatedStepIndexes.has(stepIndex),
        );
      },
    )
    .map((item) => ({
      ...item,
      ingredientIndex: ingredientIndexFor(item.from),
    }))
    .filter((item) => item.ingredientIndex >= 0);
  const swaps = aiSwaps
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
        try {
          const applied = await onApply(swap.ingredientIndex, swap);
          if (!applied) {
            button.disabled = false;
            button.textContent = "Use this swap";
            return;
          }
          button.textContent = "Swap applied ✓";
        } catch (error) {
          button.disabled = false;
          button.textContent = "Use this swap";
          toast(error.message || "This swap could not be applied.");
        }
      }),
  );
  return card;
}

function renderShoppingChecklist(
  title,
  ingredients,
  integrity = { safe: true, issues: [] },
  { allowPersistence = true } = {},
) {
  let listTitle = title;
  ingredients = ingredients.map(window.ChefDomain.normalizeGroceryItem);
  const sessionOnlyMessage =
    "This recipe stays in this session; grocery saving is unavailable. 此食譜僅限本次使用，無法儲存購物清單。";
  const card = document.createElement("article");
  card.className = "card shopping-checklist recipe-ingredient-board";
  card.innerHTML = `<div class="shopping-head"><div><p class="eyebrow">INGREDIENTS</p><div class="ingredient-title-line"><h2>Everything you need</h2><span id="ingredient-selection-count">(${ingredients.length}/${ingredients.length} selected)</span></div><p>Select what you need to buy. Every card keeps the exact quantity, unit, and preparation visible.</p></div><button class="dark" id="save-shopping-list" ${allowPersistence && integrity.safe ? "" : "disabled"}>${allowPersistence ? "Save to Grocery List →" : "Save to Grocery List unavailable"}</button></div><div class="shopping-items ingredient-card-grid">${ingredients.map((item, index) => `<label class="selected" data-ingredient-index="${index}"><input type="checkbox" data-shopping-item="${index}" checked><span class="shopping-box">✓</span><span class="ingredient-visual" aria-hidden="true">${ingredientVisual(item)}</span><span class="ingredient-copy"><b>${esc(item.name || "Ingredient")}</b><small>${esc(window.ChefDomain.ingredientDetails(item))}</small></span></label>`).join("")}</div><p class="shopping-status ${integrity.safe ? "" : "shopping-status-error"}" id="shopping-status" role="status">${!allowPersistence ? sessionOnlyMessage : integrity.safe ? `${ingredients.length} items selected` : "Generate a fully measured recipe before saving this list."}</p>`;
  const preview = document.querySelector("#plan .guided-preview");
  preview.insertAdjacentElement("beforebegin", card);
  const updateStatus = () => {
    const count = card.querySelectorAll("[data-shopping-item]:checked").length;
    card.querySelector("#shopping-status").textContent =
      `${count} item${count === 1 ? "" : "s"} selected`;
    card.querySelector("#ingredient-selection-count").textContent =
      `(${count}/${ingredients.length} selected)`;
    card.querySelectorAll("[data-shopping-item]").forEach((input) => {
      input.closest("label")?.classList.toggle("selected", input.checked);
    });
  };
  card
    .querySelectorAll("[data-shopping-item]")
    .forEach((input) => (input.onchange = updateStatus));
  card.querySelector("#save-shopping-list").onclick = async (event) => {
    if (!allowPersistence || !integrity.safe) return;
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
        recipe_id: currentPlanRecipeId || null,
        title:
          `${window.I18n.code === "zh-TW" ? "購物" : "Shopping"} · ${listTitle}`.slice(
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
    updateTitle(nextTitle) {
      listTitle = String(nextTitle || listTitle).trim() || listTitle;
    },
    updateIngredient(index, item) {
      const normalized = window.ChefDomain.normalizeGroceryItem(item);
      ingredients[index] = normalized;
      const input = card.querySelector(`[data-shopping-item="${index}"]`);
      const label = input?.closest("label");
      if (!label) return;
      label.querySelector("b").textContent = normalized.name;
      label.querySelector("small").textContent =
        window.ChefDomain.ingredientDetails(normalized);
      label.querySelector(".ingredient-visual").textContent =
        ingredientVisual(normalized);
    },
  };
}

function shoppingListIntegrityReport(list) {
  return window.ChefDomain.recipeIntegrityReport({
    ingredients: (list.shopping_list_items || []).map((item) => ({
      name: item.ingredient,
      quantity: item.quantity,
      unit: item.unit,
    })),
    steps: ["Review the shopping list."],
  });
}

async function addShoppingListToPantry(list) {
  const integrity = shoppingListIntegrityReport(list);
  if (!integrity.safe) {
    throw new Error(
      window.I18n.code === "zh-TW"
        ? "這份不完整的購物清單無法加入庫存，請先重新產生具有精確份量的食譜。"
        : "This unsafe shopping list cannot be added to pantry. Regenerate the recipe with exact measurements first.",
    );
  }
  const checkedItems = (list.shopping_list_items || []).filter(
    (item) => item.is_checked,
  );
  if (!checkedItems.length) return 0;
  const { data: pantryRows, error } = await sb
    .from("pantry_items")
    .select("id,name,quantity,unit")
    .eq("user_id", user.id);
  if (error) throw error;
  const stockedItems = checkedItems.map((item) => {
    const grocery = window.ChefDomain.normalizeGroceryItem({
      name: item.ingredient,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
    });
    return { item, grocery };
  });
  const pantryUnits = new Map(
    (pantryRows || [])
      .filter((row) => row.unit)
      .map((row) => [
        String(row.name).trim().toLocaleLowerCase(),
        row.unit,
      ]),
  );
  const unitConflict = stockedItems.find(({ grocery }) => {
    const key = grocery.name.trim().toLocaleLowerCase();
    const pantryUnit = pantryUnits.get(key);
    if (!pantryUnit) {
      if (grocery.unit) pantryUnits.set(key, grocery.unit);
      return false;
    }
    return (
      grocery.unit &&
      window.ChefDomain.convertQuantity(1, grocery.unit, pantryUnit) == null
    );
  });
  if (unitConflict) {
    const { grocery } = unitConflict;
    const pantryUnit = pantryUnits.get(
      grocery.name.trim().toLocaleLowerCase(),
    );
    throw new Error(
      window.I18n.code === "zh-TW"
        ? `無法將「${grocery.name}」加入庫存：現有單位是 ${pantryUnit}，購物清單單位是 ${grocery.unit}。請先統一單位。`
        : `Cannot stock “${grocery.name}”: the pantry uses ${pantryUnit}, but this list uses ${grocery.unit}. Make the units match first.`,
    );
  }
  let stocked = 0;
  for (const stockedItem of stockedItems) {
    const { item, grocery } = stockedItem;
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
        const nextQuantity =
          Math.round((Number(existing.quantity) + addition) * 100) / 100;
        const { error: updateError } = await sb
          .from("pantry_items")
          .update({
            quantity: nextQuantity,
            source: "shopping_list",
          })
          .eq("id", existing.id)
          .eq("user_id", user.id);
        if (updateError) throw updateError;
        existing.quantity = nextQuantity;
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
      if (updateError) throw updateError;
      existing.quantity = grocery.quantity;
      existing.unit = grocery.unit || null;
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
      if (insertError) throw insertError;
      pantryId = inserted.id;
      pantryRows.push({
        id: pantryId,
        name: grocery.name,
        quantity: grocery.quantity,
        unit: grocery.unit || null,
      });
    }
    const { error: linkError } = await sb
      .from("shopping_list_items")
      .update({ pantry_item_id: pantryId })
      .eq("id", item.id);
    if (linkError) throw linkError;
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
  markViewRendered("shopping");
  const root = document.querySelector("#shopping");
  if (!root || !user) return;
  const showSavedNotice = shoppingSavedNotice;
  shoppingSavedNotice = false;
  root.innerHTML = `<div class="title"><div><p class="eyebrow">AT THE STORE</p><h1>Your shopping<br><em>lists.</em></h1></div></div>${showSavedNotice ? '<div class="shopping-save-notice" role="status"><b>Saved to your grocery list ✓</b><span>The checked ingredients, quantities, and units are ready below.</span></div>' : ""}<div id="saved-shopping-lists"><p>Loading your lists…</p></div>`;
  const { data, error } = await sb
    .from("shopping_lists")
    .select(
      "id,title,status,created_at,recipe_id,shopping_list_items(id,ingredient,quantity,unit,category,is_checked,pantry_item_id)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
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
      const integrity = shoppingListIntegrityReport(list);
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
      return `<article class="card saved-shopping-list" data-list-id="${esc(list.id)}" data-list-index="${listIndex}"><div class="saved-shopping-head"><div><p class="eyebrow">${items.filter((item) => item.is_checked).length} OF ${items.length} PICKED</p><h2>${esc(window.I18n.translate(list.title))}</h2><small>${esc(displayDate(list.created_at))}</small></div><button class="timer-remove" data-delete-list="${esc(list.id)}" aria-label="Delete list">×</button></div>${integrity.safe ? "" : '<p class="legacy-list-warning" role="alert">This older list is missing exact quantities or units. It cannot be added to the pantry.</p>'}<div class="saved-shopping-items">${displayItems.map((item) => `<label class="${item.is_checked ? "checked" : ""}"><input type="checkbox" data-list-item="${esc(item.id)}" ${item.is_checked ? "checked" : ""}><span class="shopping-box">✓</span><b>${esc(item.grocery.name)}</b><small>${item.measurement.quantity == null ? window.I18n.translate("Quantity not specified") : `${esc(item.measurement.quantity)} ${esc(displayShoppingUnit(item.measurement.unit, item.measurement.quantity))}`}</small></label>`).join("")}</div><button class="dark stock-pantry" data-stock-list="${listIndex}" ${allChecked && list.status !== "completed" && integrity.safe ? "" : "disabled"}>${list.status === "completed" ? "Added to pantry ✓" : "Add all purchased items to pantry →"}</button></article>`;
    })
    .join("")}</div>`;
  container.querySelectorAll("[data-list-item]").forEach(
    (input) =>
      (input.onchange = async (event) => {
        const checkbox = event.currentTarget;
        const checked = checkbox.checked;
        checkbox.closest("label").classList.toggle("checked", checked);
        const { error: updateError } = await sb
          .from("shopping_list_items")
          .update({ is_checked: checked })
          .eq("id", checkbox.dataset.listItem);
        if (updateError) {
          checkbox.checked = !checked;
          checkbox.closest("label").classList.toggle("checked", !checked);
          toast(updateError.message);
          return;
        }
        const listCard = checkbox.closest("[data-list-id]");
        const inputs = [...listCard.querySelectorAll("[data-list-item]")];
        const picked = inputs.filter((item) => item.checked).length;
        listCard.querySelector(".eyebrow").textContent =
          `${picked} OF ${inputs.length} PICKED`;
        const list = data[Number(listCard.dataset.listIndex)];
        const stockButton = listCard.querySelector("[data-stock-list]");
        if (stockButton) {
          stockButton.disabled =
            list.status === "completed" ||
            picked !== inputs.length ||
            !shoppingListIntegrityReport(list).safe;
        }
        const changedItem = list.shopping_list_items.find(
          (item) => item.id === checkbox.dataset.listItem,
        );
        if (changedItem) changedItem.is_checked = checked;
      }),
  );
  container.querySelectorAll("[data-stock-list]").forEach(
    (button) =>
      (button.onclick = async () => {
        const list = data[Number(button.dataset.stockList)];
        button.disabled = true;
        button.textContent = "Adding to pantry…";
        try {
          const count = await addShoppingListToPantry(list);
          button.textContent = "Added to pantry ✓";
          toast(
            `${count} purchased item${count === 1 ? "" : "s"} added to your pantry ✓`,
            {
              actionLabel: list.recipe_id
                ? "Start cooking this dish →"
                : "Choose a recipe →",
              onAction: () => startRecipeFromShoppingList(list),
              duration: 8000,
            },
          );
          renderPantry();
        } catch (error) {
          button.disabled = false;
          button.textContent = "Add all purchased items to pantry →";
          toast(error.message || "Could not update your pantry.");
        }
      }),
  );
  container.querySelectorAll("[data-delete-list]").forEach(
    (button) =>
      (button.onclick = async () => {
        const confirmed = await confirmAction({
          title: "Delete this shopping list?",
          message:
            "The list and all of its checked-item progress will be removed.",
          confirmLabel: "Delete list",
        });
        if (!confirmed) return;
        const listCard = button.closest("[data-list-id]");
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
          .eq("id", button.dataset.deleteList)
          .eq("user_id", user.id);
        if (deleteError) toast(deleteError.message);
        else {
          listCard.remove();
          toast("Shopping list deleted");
        }
      }),
  );
}

async function startRecipeFromShoppingList(list) {
  if (!list?.recipe_id) {
    show("plan");
    return;
  }
  const { data, error } = await sb
    .from("recipes")
    .select("id,title,servings,minutes,recipe,nutrition,created_at,is_saved")
    .eq("id", list.recipe_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    toast(error?.message || "This recipe is no longer available.");
    show("plan");
    return;
  }
  renderPlan(planFromSavedRow(data));
  show("plan");
  document.querySelector("#start-guided-cook")?.click();
}

function usdaNutritionMarkup(recipe, total, foods = []) {
  const servings = Math.max(1, finiteNumber(recipe.servings, 1));
  const proteinTarget = finiteNumber(profile?.protein_g, 0);
  const proteinPercent = proteinTarget
    ? Math.round((total.protein_g / servings / proteinTarget) * 100)
    : 0;
  const zh = window.I18n.code === "zh-TW";
  const coverageText = zh
    ? `已對照 ${total.coverage_percent}% 的食材${total.estimated_conversions ? ` · ${total.estimated_conversions} 項家用單位採用估算換算` : ""}。無可靠克重的包裝或個數單位不會被猜測計入。`
    : `${total.coverage_percent}% ingredient coverage${total.estimated_conversions ? ` · ${total.estimated_conversions} household-unit conversions are estimated` : ""}. Unmatched package or piece units are excluded instead of guessed.`;
  const matches = foods.length
    ? `<details><summary>View USDA ingredient matches</summary><div class="usda-grid">${foods
        .slice(0, 8)
        .map(
          (food) =>
            `<div><b>${esc(food.ingredient)}</b><span>${displayNumber(food.per100g?.kcal)} kcal / 100 g</span><small>${esc(food.description || "USDA match")} · ${displayNumber(food.match_score, "%")} ${zh ? "名稱吻合度" : "name match"}</small><small>P ${displayNumber(food.per100g?.protein_g, "g")} · C ${displayNumber(food.per100g?.carbs_g, "g")} · F ${displayNumber(food.per100g?.fat_g, "g")}</small></div>`,
        )
        .join("")}</div></details>`
    : "";
  const qualityWarning = total.needs_review
    ? `<div class="usda-quality-warning" role="alert"><b>${zh ? "這份營養數字需要人工確認" : "These nutrition figures need review"}</b><span>${zh ? `USDA 與 AI 估算差距較大${total.low_confidence_matches ? `，另有 ${total.low_confidence_matches} 項名稱配對信心較低` : ""}。請展開下方配對，確認 USDA 食品是否與實際食材相同。` : `USDA differs materially from the recipe estimate${total.low_confidence_matches ? ` and ${total.low_confidence_matches} name match${total.low_confidence_matches === 1 ? " is" : "es are"} lower confidence` : ""}. Open the matches below and confirm the reference foods.`}</span></div>`
    : "";
  return `<p class="eyebrow">USDA FOODDATA CENTRAL · WHOLE MEAL</p><h2>USDA-backed meal nutrition.</h2><p>${coverageText}</p>${qualityWarning}<div class="usda-total"><div><b>${displayNumber(total.kcal)}</b><span>${zh ? "大卡 · 整份食譜" : "kcal · whole recipe"}</span><small>${displayNumber(total.kcal / servings)} ${zh ? "每人份" : "per serving"}</small></div><div><b>${displayNumber(total.protein_g, "g")}</b><span>${zh ? "蛋白質 · 整份食譜" : "protein · whole recipe"}</span><small>${displayNumber(total.protein_g / servings, "g")} ${zh ? `每人份 · 每日目標的 ${proteinPercent}%` : `per serving · ${proteinPercent}% of daily target`}</small></div><div><b>${displayNumber(total.carbs_g, "g")}</b><span>${zh ? "碳水化合物" : "carbs"}</span><small>${displayNumber(total.carbs_g / servings, "g")} ${zh ? "每人份" : "per serving"}</small></div><div><b>${displayNumber(total.fat_g, "g")}</b><span>${zh ? "脂肪" : "fat"}</span><small>${displayNumber(total.fat_g / servings, "g")} ${zh ? "每人份" : "per serving"}</small></div></div>${matches}`;
}

async function renderUsdaReference(
  recipe,
  { force = false, planInstanceId = currentPlanInstanceId } = {},
) {
  const planRecipeId = currentPlanRecipeId;
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
  if (isSessionOnlyRecipe(recipe)) {
    card.innerHTML =
      '<p class="eyebrow">SESSION-ONLY RECIPE · 本次食譜</p><h2>This recipe stays in this session.</h2><p>USDA nutrition is not requested or saved for sourced session-only recipes. 此來源食譜僅限本次使用，不會查詢或儲存 USDA 營養資料。</p>';
    return;
  }
  if (recipe.usda_nutrition && !force) {
    card.innerHTML = usdaNutritionMarkup(recipe, recipe.usda_nutrition);
    return;
  }
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
    if (
      renderVersion !== usdaRenderVersion ||
      planInstanceId !== currentPlanInstanceId ||
      !card.isConnected
    )
      return;
    const total = window.ChefDomain.calculateUsdaMealNutrition(
      ingredients,
      foods,
    );
    const estimate = {
      kcal: finiteNumber(recipe.kcal),
      protein_g: finiteNumber(recipe.protein_g),
      carbs_g: finiteNumber(recipe.carbs_g),
      fat_g: finiteNumber(recipe.fat_g),
      basis: "AI recipe estimate for the whole recipe",
    };
    Object.assign(
      total,
      window.ChefDomain.compareNutritionEstimates(total, estimate, foods),
    );
    recipe.usda_nutrition = total;
    if (currentPlanInstanceId === planInstanceId)
      currentPlan.usda_nutrition = total;
    if (planRecipeId && recipe.source_persistence !== "session_only") {
      const persistedRecipe = currentPlan || recipe;
      sb.from("recipes")
        .update({
          recipe: persistedRecipe,
          nutrition: { estimate, usda: total },
          updated_at: new Date().toISOString(),
        })
        .eq("id", planRecipeId)
        .eq("user_id", user.id)
        .then(({ error }) => {
          if (error) console.warn("Could not persist USDA totals", error);
        });
    }
    card.innerHTML = usdaNutritionMarkup(recipe, total, foods);
  } catch (error) {
    const noMatches =
      error instanceof Error && error.message === "No USDA matches found";
    card.innerHTML = noMatches
      ? '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>No matching USDA reference is available.</h2><p>USDA did not return a reliable match for these ingredients. Your recipe and grocery quantities are unaffected.</p>'
      : '<p class="eyebrow">USDA FOODDATA CENTRAL</p><h2>USDA reference data is unavailable right now.</h2><p>Your recipe and grocery quantities are ready; only the optional nutrition reference could not be loaded.</p>';
  }
}

function prepareGeneratedPlan(rawPlan, request, fallback = false) {
  const plan = {
    ...(rawPlan && typeof rawPlan === "object" ? rawPlan : {}),
    userRequest: request,
    fallback: Boolean(fallback || rawPlan?.fallback),
    is_saved: false,
    saved_recipe_id: null,
  };
  if (plan.source_persistence !== "session_only") {
    plan.persistence_notice =
      "This plan stays in this browser session until you select Cook later.";
  }
  return plan;
}

function renderMenuPlanCards(result) {
  document.querySelector("#menu-plan-results")?.remove();
  const form = document.querySelector("#meal-form");
  if (!form) return;
  menuPlanResults = Array.isArray(result?.recipes)
    ? result.recipes.slice(0, 6)
    : [];
  const readyCount = menuPlanResults.filter(
    (item) => item.status === "ready",
  ).length;
  const panel = document.createElement("section");
  panel.id = "menu-plan-results";
  panel.className = "menu-plan-results";
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `
    <div class="menu-plan-heading">
      <div>
        <p class="eyebrow">YOUR MENU</p>
        <h2>${esc(window.I18n.translate("Your recipes are ready."))}</h2>
        <p>${esc(
          window.I18n.code === "zh-TW"
            ? `${readyCount} / ${menuPlanResults.length} 道食譜已完成；每一道都可獨立開啟或重試。`
            : `${readyCount} of ${menuPlanResults.length} recipes are ready. Open or retry each dish independently.`,
        )}</p>
      </div>
    </div>
    <div class="menu-plan-grid">
      ${menuPlanResults
        .map((item, index) => {
          const dish = String(item.requested_dish || "Requested dish");
          if (item.status === "ready" && item.plan) {
            const plan = item.plan;
            return `<article class="menu-plan-card ready" data-menu-card="${index}">
              <span class="menu-plan-status">${esc(window.I18n.translate("Recipe ready"))}</span>
              <h3>${esc(plan.title || dish)}</h3>
              <p>${esc(plan.summary || dish)}</p>
              <div class="menu-plan-facts"><span>◷ ${displayNumber(finiteNumber(plan.minutes, 30))} min</span><span>${displayNumber(finiteNumber(plan.servings, 2))} servings</span></div>
              <div class="menu-plan-actions">
                <button class="dark" type="button" data-menu-open="${index}">${esc(window.I18n.translate("Open recipe"))}</button>
                <button class="cream" type="button" data-menu-cook="${index}">${esc(window.I18n.translate("Start cooking"))}</button>
                <button class="link" type="button" data-menu-shopping="${index}">${esc(window.I18n.translate("Review shopping"))}</button>
              </div>
            </article>`;
          }
          if (item.status === "clarification_required") {
            const candidates = Array.isArray(item.candidates)
              ? item.candidates.slice(0, 3)
              : [];
            return `<article class="menu-plan-card clarification" data-menu-card="${index}">
              <span class="menu-plan-status">${esc(window.I18n.translate("Needs clarification"))}</span>
              <h3>${esc(dish)}</h3>
              <p>${esc(item.message || window.I18n.translate("Add ingredients or cooking details so Jarvis can identify this custom dish."))}</p>
              <div class="menu-plan-actions">${candidates
                .map(
                  (candidate) =>
                    `<button class="cream" type="button" data-menu-candidate="${index}" data-menu-candidate-value="${esc(candidate)}">${esc(candidate)}</button>`,
                )
                .join("")}<button class="link" type="button" data-menu-retry="${index}">${esc(window.I18n.translate("Edit and retry"))}</button></div>
            </article>`;
          }
          return `<article class="menu-plan-card unavailable" data-menu-card="${index}">
            <span class="menu-plan-status">${esc(window.I18n.translate("Recipe unavailable"))}</span>
            <h3>${esc(dish)}</h3>
            <p>${esc(item.message || window.I18n.translate("This recipe could not be completed right now."))}</p>
            <button class="cream" type="button" data-menu-retry="${index}">${esc(window.I18n.translate("Try this dish again"))}</button>
          </article>`;
        })
        .join("")}
    </div>`;
  form.insertAdjacentElement("afterend", panel);

  const openPlan = (index, action = "open") => {
    const item = menuPlanResults[index];
    if (item?.status !== "ready" || !item.plan) return;
    renderPlan(item.plan);
    show("plan");
    if (action === "cook") {
      setTimeout(() => document.querySelector("#start-guided-cook")?.click(), 0);
    }
    if (action === "shopping") {
      setTimeout(
        () =>
          document
            .querySelector("#plan .shopping-checklist")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        0,
      );
    }
  };
  panel.querySelectorAll("[data-menu-open]").forEach(
    (button) =>
      (button.onclick = () => openPlan(Number(button.dataset.menuOpen))),
  );
  panel.querySelectorAll("[data-menu-cook]").forEach(
    (button) =>
      (button.onclick = () =>
        openPlan(Number(button.dataset.menuCook), "cook")),
  );
  panel.querySelectorAll("[data-menu-shopping]").forEach(
    (button) =>
      (button.onclick = () =>
        openPlan(Number(button.dataset.menuShopping), "shopping")),
  );
  const retryDish = (dish) => {
    const input = document.querySelector("#meal-input");
    if (!input) return;
    input.value = dish;
    input.focus();
    form.requestSubmit();
  };
  panel.querySelectorAll("[data-menu-retry]").forEach(
    (button) =>
      (button.onclick = () => {
        const item = menuPlanResults[Number(button.dataset.menuRetry)];
        retryDish(String(item?.requested_dish || ""));
      }),
  );
  panel.querySelectorAll("[data-menu-candidate]").forEach(
    (button) =>
      (button.onclick = () =>
        retryDish(String(button.dataset.menuCandidateValue || ""))),
  );
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function generatePlan(request) {
  const generationEpoch = chefStateEpoch;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const ownerUserId = session.user.id;
  assertGenerationContext(ownerUserId, generationEpoch);
  const controller = new AbortController();
  pendingGenerationControllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), 50000);
  try {
    let response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/chef-meal-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ request, language: window.I18n.code }),
        signal: controller.signal,
      });
      assertGenerationContext(ownerUserId, generationEpoch);
    } catch (error) {
      assertGenerationContext(ownerUserId, generationEpoch);
      if (error?.name === "AbortError") {
        throw new Error(
          window.I18n.code === "zh-TW"
            ? "食譜產生時間過久，請再試一次。"
            : "Recipe generation took too long. Please try again.",
        );
      }
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    assertGenerationContext(ownerUserId, generationEpoch);
    if (data.request_type === "menu" && Array.isArray(data.recipes)) {
      const recipes = data.recipes.slice(0, 6).map((item) => {
        const requestedDish = String(item?.requested_dish || "").slice(0, 160);
        if (item?.status !== "ready" || !item.plan) {
          return {
            ...item,
            requested_dish: requestedDish,
          };
        }
        return {
          ...item,
          requested_dish: requestedDish,
          plan: prepareGeneratedPlan(
            item.plan,
            requestedDish,
            Boolean(item.fallback || item.plan?.fallback),
          ),
        };
      });
      return {
        kind: "menu",
        ownerUserId,
        generationEpoch,
        originalRequest: data.original_request || request,
        recipes,
        meta: data.meta || {},
      };
    }
    if (data.clarification_required) {
      return {
        kind: "clarification",
        ownerUserId,
        generationEpoch,
        originalRequest: data.original_request || request,
        needsDescription: Boolean(data.needs_description),
        candidates: Array.isArray(data.candidates) ? data.candidates.slice(0, 3) : [],
      };
    }
    if (!response.ok) {
      const error = new Error(data.error || "Jarvis could not create a plan.");
      error.code = data.code || "";
      const responseMeta =
        data.meta && typeof data.meta === "object" ? data.meta : {};
      error.meta = {
        request_id: String(responseMeta.request_id || "").slice(0, 64),
        outcome: String(responseMeta.outcome || "").slice(0, 80),
        duration_ms: Number.isFinite(Number(responseMeta.duration_ms))
          ? Number(responseMeta.duration_ms)
          : 0,
        failure_stage: String(responseMeta.failure_stage || "").slice(0, 80),
        failure_reason: String(responseMeta.failure_reason || "").slice(0, 80),
      };
      throw error;
    }
    const plan = prepareGeneratedPlan(
      data.plan,
      request,
      Boolean(data.fallback || data.plan?.fallback),
    );
    assertGenerationContext(ownerUserId, generationEpoch);
    return {
      kind: "plan",
      ownerUserId,
      generationEpoch,
      plan,
    };
  } finally {
    clearTimeout(timeout);
    pendingGenerationControllers.delete(controller);
  }
}

async function saveGeneratedPlanForLater(
  recipe,
  planInstanceId = currentPlanInstanceId,
) {
  const generationEpoch = chefStateEpoch;
  const {
    data: { session },
  } = await sb.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const ownerUserId = session.user.id;
  assertGenerationContext(ownerUserId, generationEpoch);
  const controller = new AbortController();
  pendingPersistenceControllers.add(controller);
  try {
    const savedPlan = await persistGeneratedPlan(
      recipe,
      recipe.userRequest || recipe.title,
      ownerUserId,
      generationEpoch,
      controller.signal,
    );
    assertGenerationContext(ownerUserId, generationEpoch);
    recipe.saved_recipe_id = savedPlan.saved_recipe_id;
    recipe.is_saved = true;
    if (currentPlanInstanceId === planInstanceId) {
      currentPlanRecipeId = savedPlan.saved_recipe_id;
      currentPlan.saved_recipe_id = savedPlan.saved_recipe_id;
      currentPlan.is_saved = true;
    }
    if (
      activeRecipe &&
      activeRecipeInstanceId === planInstanceId
    ) {
      activeRecipe.saved_recipe_id = savedPlan.saved_recipe_id;
      activeRecipeId = savedPlan.saved_recipe_id;
      persistCookingState();
    }
    return savedPlan;
  } finally {
    pendingPersistenceControllers.delete(controller);
  }
}

async function persistGeneratedPlan(
  plan,
  request,
  ownerUserId,
  generationEpoch,
  signal,
) {
  assertGenerationContext(ownerUserId, generationEpoch);
  if (plan.source_persistence === "session_only") {
    plan.is_saved = false;
    plan.saved_recipe_id = null;
    plan.persistence_notice = window.I18n.translate(
      "This sourced recipe is available in this session and was not stored.",
    );
    return plan;
  }
  try {
    assertGenerationContext(ownerUserId, generationEpoch);
    const recipeForStorage = {
      ...plan,
      saved_recipe_id: null,
      is_saved: true,
    };
    let insert = sb
      .from("recipes")
      .insert({
        user_id: ownerUserId,
        app_user_id: ownerUserId,
        title: String(plan.title || request).slice(0, 160),
        servings: finiteNumber(plan.servings, 2),
        minutes: finiteNumber(plan.minutes),
        recipe: recipeForStorage,
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
      });
    if (signal && typeof insert.abortSignal === "function")
      insert = insert.abortSignal(signal);
    const { data: saved, error } = await insert
      .select("id")
      .single();
    if (error) throw error;
    assertGenerationContext(ownerUserId, generationEpoch);
    plan.saved_recipe_id = saved.id;
    plan.is_saved = true;
  } catch (error) {
    if (error?.code === "stale_auth_context") throw error;
    if (signal?.aborted) throw staleAuthContextError();
    assertGenerationContext(ownerUserId, generationEpoch);
    throw error;
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

async function insertQuickNutritionLog(values) {
  const { error } = await sb.from("nutrition_logs").insert({
    user_id: user.id,
    app_user_id: user.id,
    eaten_on: localDateKey(),
    ...values,
  });
  if (error) throw error;
  renderDailyNutritionProgress();
}

async function openQuickNutritionLog() {
  const modal = document.createElement("div");
  modal.className = "modal quick-log-modal";
  modal.innerHTML = `<div class="modal-card quick-log-card" role="dialog" aria-modal="true" aria-labelledby="quick-log-title"><p class="eyebrow">QUICK LOG</p><h2 id="quick-log-title">Add a meal to today.</h2><p>Log a saved recipe without starting Chef Mode, or enter a simple estimate for anything else you ate.</p><div class="quick-log-grid"><form class="quick-log-option" id="quick-saved-form"><p class="eyebrow">FROM YOUR RECIPES</p><div class="field"><label>Saved recipe</label><select name="recipe" disabled><option>Loading saved recipes…</option></select><small data-saved-help>Loading your recipe folder.</small></div><div class="field"><label>Servings eaten</label><input name="servings" type="number" min="0.25" max="12" step="0.25" value="1" required></div><button class="dark" type="submit" disabled>Log saved recipe →</button></form><form class="quick-log-option" id="quick-manual-form"><p class="eyebrow">MANUAL ESTIMATE</p><div class="field"><label>Meal name</label><input name="title" maxlength="160" placeholder="e.g. Breakfast sandwich"></div><div class="quick-macro-grid"><div class="field"><label>Calories</label><input name="calories" type="number" min="1" max="10000" step="1" required></div><div class="field"><label>Protein (g)</label><input name="protein" type="number" min="0" max="500" step="0.1" value="0" required></div><div class="field"><label>Carbs (g)</label><input name="carbs" type="number" min="0" max="1000" step="0.1" value="0"></div><div class="field"><label>Fat (g)</label><input name="fat" type="number" min="0" max="500" step="0.1" value="0"></div></div><button class="dark" type="submit">Add estimate →</button></form></div><div class="form-actions"><button type="button" class="cream" data-quick-close>Cancel</button></div></div>`;
  document.body.append(modal);
  window.associateFieldLabels?.(modal);
  const close = bindDismissibleModal(modal);
  modal.querySelector("[data-quick-close]").onclick = close;
  const savedForm = modal.querySelector("#quick-saved-form");
  const savedSelect = savedForm.elements.recipe;
  const savedButton = savedForm.querySelector('button[type="submit"]');
  const finish = (message) => {
    close();
    show("home");
    toast(message, {
      actionLabel: "View today’s intake →",
      onAction: () =>
        document
          .querySelector("#daily-metrics")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    });
  };
  const manualForm = modal.querySelector("#quick-manual-form");
  manualForm.onsubmit = async (event) => {
    event.preventDefault();
    const button = manualForm.querySelector('button[type="submit"]');
    const calories = finiteNumber(manualForm.elements.calories.value);
    const protein = finiteNumber(manualForm.elements.protein.value, 0);
    const carbs = finiteNumber(manualForm.elements.carbs.value, 0);
    const fat = finiteNumber(manualForm.elements.fat.value, 0);
    if (calories == null || calories <= 0)
      return toast("Enter an estimated calorie amount first.");
    button.disabled = true;
    button.textContent = "Logging…";
    try {
      await insertQuickNutritionLog({
        recipe_id: null,
        recipe_title:
          String(manualForm.elements.title.value || "Quick meal estimate")
            .trim()
            .slice(0, 160) || "Quick meal estimate",
        calories,
        protein_g: Math.max(0, protein),
        carbs_g: Math.max(0, carbs),
        fat_g: Math.max(0, fat),
        servings_eaten: 1,
        nutrition_source: "manual_estimate",
        usda_coverage: null,
      });
      finish("Meal estimate added to today’s intake ✓");
    } catch (logError) {
      button.disabled = false;
      button.textContent = "Add estimate →";
      toast(logError.message || "Could not log this meal.");
    }
  };
  const { data: rows, error } = await sb
    .from("recipes")
    .select("id,title,servings,minutes,recipe,nutrition,created_at,is_saved")
    .eq("user_id", user.id)
    .eq("is_saved", true)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (!modal.isConnected) return;
  if (error || !rows?.length) {
    savedSelect.innerHTML = "<option>No saved recipes yet</option>";
    modal.querySelector("[data-saved-help]").textContent = error
      ? "Saved recipes could not be loaded. You can still add a manual estimate."
      : "Save a recipe first, or use the manual estimate beside it.";
  } else {
    savedSelect.innerHTML = rows
      .map((row) => `<option value="${esc(row.id)}">${esc(row.title)}</option>`)
      .join("");
    savedSelect.disabled = false;
    savedButton.disabled = false;
    modal.querySelector("[data-saved-help]").textContent =
      "Nutrition scales with the servings you enter.";
  }
  savedForm.onsubmit = async (event) => {
    event.preventDefault();
    const row = rows?.find((item) => item.id === savedSelect.value);
    if (!row) return;
    const recipe = planFromSavedRow(row);
    const servings = Math.max(
      0.25,
      Math.min(12, finiteNumber(savedForm.elements.servings.value, 1)),
    );
    savedButton.disabled = true;
    savedButton.textContent = "Logging…";
    try {
      await insertQuickNutritionLog({
        recipe_id: row.id,
        recipe_title: String(recipe.title).slice(0, 160),
        ...nutritionForServings(recipe, servings),
      });
      finish("Saved recipe added to today’s intake ✓");
    } catch (logError) {
      savedButton.disabled = false;
      savedButton.textContent = "Log saved recipe →";
      toast(logError.message || "Could not log this meal.");
    }
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
  if (!recipeItems.length) return { count: 0, changes: [] };
  const { data: pantryRows, error } = await sb
    .from("pantry_items")
    .select(
      "id,user_id,app_user_id,name,quantity,unit,storage_zone,expires_on,source,image_url,created_at,updated_at",
    )
    .eq("user_id", user.id);
  if (error) {
    console.warn("Could not load pantry for deduction", error);
    return { count: 0, changes: [] };
  }
  let updated = 0;
  const changes = [];
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
    if (!updateError) {
      changes.push({
        kind: remaining <= 0 ? "delete" : "update",
        before: { ...pantryItem },
      });
      updated += 1;
    }
  }
  return { count: updated, changes };
}

async function undoPantryDeduction(changes) {
  let restored = 0;
  for (const change of changes || []) {
    const before = change?.before;
    if (!before?.id) continue;
    const result =
      change.kind === "delete"
        ? await sb.from("pantry_items").upsert(before, { onConflict: "id" })
        : await sb
            .from("pantry_items")
            .update({
              quantity: before.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq("id", before.id)
            .eq("user_id", user.id);
    if (!result.error) restored += 1;
  }
  if (restored) renderPantry();
  return restored;
}

function openMealFeedback(recipe, nutritionLogPromise) {
  const modal = document.createElement("div");
  modal.className = "modal meal-feedback-modal";
  const servingsLimit = 12;
  modal.innerHTML = `<form class="modal-card feedback-card"><p class="eyebrow">HELP JARVIS LEARN</p><h2>How did this meal taste?</h2><p>One quick rating helps future recipes fit you better.</p><div class="automation-summary"><p class="eyebrow">AUTOMATICALLY COMPLETED</p><div data-auto-nutrition>◌ Recording 1 serving of nutrition…</div><div data-auto-pantry>◌ Checking recipe amounts against your pantry…</div></div><div class="field"><label>Servings you ate</label><input name="servings_eaten" type="number" min="0.25" max="${servingsLimit}" step="0.25" value="1" required><small>Nutrition starts at one serving. Change this if you ate more.</small></div><div class="rating-row" role="radiogroup" aria-label="Meal rating">${[1, 2, 3, 4, 5].map((rating) => `<label><input type="radio" name="rating" value="${rating}" required><span>${rating}★</span></label>`).join("")}</div><div class="field"><label>Optional note</label><input name="note" maxlength="300" placeholder="e.g. Less spicy next time"></div><div class="form-actions"><button type="button" class="cream" data-feedback-skip>Skip rating</button><button type="submit" class="dark">Save feedback →</button></div></form>`;
  document.body.append(modal);
  window.associateFieldLabels?.(modal);
  const close = bindDismissibleModal(modal);
  const form = modal.querySelector("form");
  const nutritionStatus = modal.querySelector("[data-auto-nutrition]");
  const pantryStatus = modal.querySelector("[data-auto-pantry]");
  nutritionLogPromise.then((nutritionLogId) => {
    if (!modal.isConnected) return;
    nutritionStatus.textContent = nutritionLogId
      ? "✓ Recorded 1 serving in today’s nutrition"
      : "! Nutrition could not be recorded";
  });
  const updateLoggedServings = async (rawValue) => {
    const servingsEaten = Math.max(
      0.25,
      Math.min(servingsLimit, finiteNumber(rawValue, 1)),
    );
    const nutritionLogId = await nutritionLogPromise;
    if (!nutritionLogId || servingsEaten === 1) return;
    const { error } = await sb
      .from("nutrition_logs")
      .update(nutritionForServings(recipe, servingsEaten))
      .eq("id", nutritionLogId)
      .eq("user_id", user.id);
    if (error) console.warn("Could not update meal servings", error);
    else {
      renderDailyNutritionProgress();
      if (modal.isConnected)
        nutritionStatus.textContent = `✓ Recorded ${displayNumber(servingsEaten)} servings in today’s nutrition`;
    }
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
    toast("Thanks — Jarvis will remember this for future meals ✓", {
      actionLabel: "View today’s intake →",
      onAction: () => {
        show("home");
        document
          .querySelector("#daily-metrics")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
      duration: 8000,
    });
  };
  return {
    setPantry(result) {
      if (!modal.isConnected) return;
      const count = result?.count || 0;
      pantryStatus.textContent = count
        ? `✓ Deducted ${count} pantry item${count === 1 ? "" : "s"}`
        : "✓ Pantry checked — no matching measured items to deduct";
      if (!result?.changes?.length) return;
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "automation-undo";
      undo.textContent = "Undo";
      undo.onclick = async () => {
        undo.disabled = true;
        undo.textContent = "Restoring…";
        const restored = await undoPantryDeduction(result.changes);
        pantryStatus.textContent = `↶ Restored ${restored} pantry item${restored === 1 ? "" : "s"}`;
      };
      pantryStatus.append(" ", undo);
    },
    setPantryError() {
      if (modal.isConnected)
        pantryStatus.textContent = "! Pantry could not be updated";
    },
  };
}

async function completeCooking(recipe) {
  stopVoiceControl();
  clearCookingState("completed");
  releaseWakeLock();
  renderCook();
  if (isSessionOnlyRecipe(recipe)) {
    toast(
      "Dish completed in this session ✓ Nothing was saved or changed, including pantry, nutrition, feedback, and cooking progress. 料理已完成 ✓ 沒有儲存或變更任何資料，包括食材庫、營養、評價與烹飪進度。",
    );
    return;
  }
  const nutritionLogPromise = logCompletedMeal(recipe);
  const feedback = openMealFeedback(recipe, nutritionLogPromise);
  nutritionLogPromise.then((logId) => {
    if (logId) renderDailyNutritionProgress();
  });
  deductRecipeFromPantry(recipe)
    .then((result) => feedback.setPantry(result))
    .catch((error) => {
      console.warn("Could not update pantry after cooking", error);
      feedback.setPantryError();
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
  const timerButtons = [
    ...document.querySelectorAll("[data-current-step-timer]"),
  ];
  const timerButton =
    timerButtons.find((button) => {
      const timer = timers[Number(button.dataset.timerIndex)];
      return timer?.running;
    }) ||
    timerButtons.find((button) => {
      const timer = timers[Number(button.dataset.timerIndex)];
      return timer && !timer.completed;
    }) ||
    timerButtons.at(-1);
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
  markViewRendered("cook");
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
  const currentTimerMarkup = currentStep.timers.length
    ? `<div class="current-step-timers"><p>${currentStep.timers.length > 1 ? "Run these countdowns in recipe order." : "Recipe countdown"}</p>${currentStep.timers
        .map((stepTimer, stepTimerIndex) => {
          const timerIndex = timers.findIndex(
            (timer) =>
              timer.source === "recipe" &&
              timer.stepIndex === cookingStepIndex &&
              timer.stepTimerIndex === stepTimerIndex,
          );
          const timer = timers[timerIndex];
          const status = timer?.running
            ? "Pause"
            : timer?.completed
              ? "Restart"
              : "Start";
          return `<button type="button" class="current-step-timer" data-current-step-timer data-step-timer-index="${stepTimerIndex}" data-timer-index="${timerIndex}" aria-label="${esc(`${status} ${stepTimer.label}`)}"><b>⏱ ${esc(stepTimer.label)}<small>${currentStep.timers.length > 1 ? `${stepTimerIndex + 1} of ${currentStep.timers.length} · ` : ""}${status} timer</small></b><span>${formatTime(timer?.sec ?? stepTimer.duration_seconds)}</span></button>`;
        })
        .join("")}</div>`
    : "";
  const showVoiceTip = shouldShowVoiceTip(recipe);
  const progressPersistenceCopy = isEphemeralRecipe(activeRecipe)
    ? window.I18n.translate(
        "This Chef Mode progress is available only in this tab and is lost on refresh.",
      )
    : window.I18n.translate(
        "Only real cooking and waiting times become recipe countdowns. Your progress survives a refresh.",
      );
  root.innerHTML = `
    <div class="chef-mode-heading"><div><p class="eyebrow">CHEF MODE · ${activeRecipe ? "ACTIVE RECIPE" : "READY"}</p><h1>${esc(recipe.title)}<br><em>cook with Jarvis.</em></h1></div><div class="chef-voice-actions"><button class="cream" id="chef-voice">🎙 Hands-free</button><button class="cream" id="chef-read">🔊 Read current step</button></div></div>
    ${showVoiceTip ? '<aside class="chef-voice-tip" role="status"><div><b>🎙 Cook hands-free</b><span>Say “next step”, “repeat”, or “start timer” while your hands are busy.</span></div><button type="button" class="cream" id="dismiss-voice-tip">Got it</button></aside>' : ""}
    <div class="chef-mode-grid"><section class="chef-guide"><div class="chef-step-counter"><span>STEP ${cookingStepIndex + 1} / ${steps.length}</span><div>${steps.map((_, index) => `<i class="${index < cookingStepIndex ? "done" : index === cookingStepIndex ? "now" : ""}"></i>`).join("")}</div></div><article class="current-step chef-current"><span>DO THIS NOW</span><h2>${esc(current)}</h2>${currentTimerMarkup}<p>${esc(progressPersistenceCopy)}</p></article><div class="guide-actions"><button class="cream" id="previous-step" ${cookingStepIndex === 0 ? "disabled" : ""}>← Previous</button><button class="cream" id="repeat-step">↻ Repeat</button><button class="dark" id="complete-step">${cookingStepIndex === steps.length - 1 ? "Finish dish ✓" : "Complete step →"}</button></div><div class="chef-queue"><p class="eyebrow">RECIPE QUEUE</p>${steps.map((step, index) => `<button class="${index === cookingStepIndex ? "current" : index < cookingStepIndex ? "done" : ""}" data-jump-step="${index}"><b>${index < cookingStepIndex ? "✓" : index + 1}</b><span>${esc(step.instruction)}</span></button>`).join("")}</div>${
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
  root.querySelector("#dismiss-voice-tip")?.addEventListener("click", () => {
    dismissVoiceTip(recipe);
    root.querySelector(".chef-voice-tip")?.remove();
  });
  root.querySelector("#chef-read").onclick = () => sayInstruction(current);
  root.querySelector("#chef-voice").onclick = toggleVoiceControl;
  updateVoiceButton();
  root.querySelector("#previous-step").onclick = () => {
    cookingStepIndex--;
    persistCookingState();
    renderCook();
  };
  root.querySelector("#repeat-step").onclick = () => sayInstruction(current);
  root.querySelectorAll("[data-current-step-timer]").forEach((button) =>
    button.addEventListener("click", async (event) => {
      let timerIndex = Number(event.currentTarget.dataset.timerIndex);
      if (timerIndex < 0) {
        const stepTimerIndex = Number(
          event.currentTarget.dataset.stepTimerIndex,
        );
        const timer =
          window.ChefDomain.buildRecipeTimers([currentStep])[stepTimerIndex];
        if (!timer) return;
        timer.stepIndex = cookingStepIndex;
        timer.stepNumber = cookingStepIndex + 1;
        timers.push(timer);
        timerIndex = timers.length - 1;
        renderTimerList();
      }
      await toggleTimer(timerIndex);
    }),
  );
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
  window.associateFieldLabels?.(modal);
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
    syncTimerTicker();
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
  syncTimerTicker();
  persistCookingState();
  updateTimerDisplays();
  if (
    timer.running &&
    timer.mode === "countdown" &&
    "Notification" in window &&
    Notification.permission === "default"
  )
    Notification.requestPermission();
  prepareAlarmAudio();
  if (timer.running) await requestWakeLock();
}

function renderCurrentStepTimer() {
  const buttons = document.querySelectorAll("[data-current-step-timer]");
  if (!buttons.length || !activeRecipe) return;
  const currentStep = window.ChefDomain.normalizeRecipeSteps(
    activeRecipe.steps,
  )[cookingStepIndex];
  buttons.forEach((button) => {
    const stepTimerIndex = Number(button.dataset.stepTimerIndex);
    let timerIndex = Number(button.dataset.timerIndex);
    let timer = Number.isInteger(timerIndex) ? timers[timerIndex] : null;
    if (
      !timer ||
      timer.source !== "recipe" ||
      timer.stepIndex !== cookingStepIndex ||
      timer.stepTimerIndex !== stepTimerIndex
    ) {
      timerIndex = timers.findIndex(
        (item) =>
          item.source === "recipe" &&
          item.stepIndex === cookingStepIndex &&
          item.stepTimerIndex === stepTimerIndex,
      );
      timer = timers[timerIndex];
    }
    button.dataset.timerIndex = String(timerIndex);
    const status = timer?.running
      ? "Pause"
      : timer?.completed
        ? "Restart"
        : "Start";
    const stepTimer = currentStep?.timers?.[stepTimerIndex];
    button.setAttribute(
      "aria-label",
      `${status} ${stepTimer?.label || "this timer"}`,
    );
    const statusText = button.querySelector("small");
    const timeText = button.querySelector("span");
    if (statusText)
      statusText.textContent = `${currentStep.timers.length > 1 ? `${stepTimerIndex + 1} of ${currentStep.timers.length} · ` : ""}${status} timer`;
    if (timeText)
      timeText.textContent = formatTime(
        timer?.sec ?? stepTimer?.duration_seconds ?? 0,
      );
  });
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
        `<article class="timer chef-timer ${timer.completed ? "timer-complete" : ""} ${timer.stepIndex === cookingStepIndex ? "timer-current-step" : ""}" data-timer-row="${index}"><span><i data-timer-icon>${timer.completed ? "✓" : timer.mode === "stopwatch" ? "◷" : "◴"}</i>${esc(timer.name)}<small data-timer-status>${timer.completed ? "Finished" : timer.mode === "stopwatch" ? "Stopwatch" : timer.stepNumber ? `Step ${timer.stepNumber} · Recipe countdown` : "Countdown"}</small></span><b data-timer-time>${formatTime(timer.sec)}</b><div class="timer-actions"><button data-start="${index}">${timer.completed ? "Restart" : timer.running ? "Pause" : "Start"}</button><button data-reset="${index}">Reset</button><button class="timer-remove" data-remove="${index}" aria-label="Remove clock">×</button></div></article>`,
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
        updateTimerDisplays();
        syncTimerTicker();
      }),
  );
  list.querySelectorAll("[data-remove]").forEach(
    (button) =>
      (button.onclick = () => {
        timers.splice(Number(button.dataset.remove), 1);
        persistCookingState();
        renderTimerList();
        syncTimerTicker();
      }),
  );
}

function updateTimerDisplays() {
  renderCurrentStepTimer();
  const list = document.querySelector("#timer-list");
  if (!list) return;
  const rows = [...list.querySelectorAll("[data-timer-row]")];
  if (rows.length !== timers.length) {
    renderTimerList();
    return;
  }
  rows.forEach((row, index) => {
    const timer = timers[index];
    if (!timer) return;
    row.classList.toggle("timer-complete", timer.completed);
    row.classList.toggle(
      "timer-current-step",
      timer.stepIndex === cookingStepIndex,
    );
    const icon = row.querySelector("[data-timer-icon]");
    const status = row.querySelector("[data-timer-status]");
    const time = row.querySelector("[data-timer-time]");
    const start = row.querySelector("[data-start]");
    if (icon)
      icon.textContent = timer.completed
        ? "✓"
        : timer.mode === "stopwatch"
          ? "◷"
          : "◴";
    if (status)
      status.textContent = timer.completed
        ? "Finished"
        : timer.mode === "stopwatch"
          ? "Stopwatch"
          : timer.stepNumber
            ? `Step ${timer.stepNumber} · Recipe countdown`
            : "Countdown";
    if (time) time.textContent = formatTime(timer.sec);
    if (start)
      start.textContent = timer.completed
        ? "Restart"
        : timer.running
          ? "Pause"
          : "Start";
  });
}

function hasRunningTimer() {
  return timers.some((timer) => timer.running);
}

function stopTimerTicker() {
  if (!timerTickInterval) return;
  clearInterval(timerTickInterval);
  timerTickInterval = null;
}

function syncTimerTicker() {
  if (!hasRunningTimer()) {
    stopTimerTicker();
    return;
  }
  if (timerTickInterval) return;
  lastTimerTick = Date.now();
  timerTickInterval = setInterval(tickRunningTimers, 250);
}

function tickRunningTimers() {
  if (!hasRunningTimer()) {
    stopTimerTicker();
    return;
  }
  const now = Date.now();
  const elapsed = Math.floor((now - lastTimerTick) / 1000);
  if (elapsed < 1) return;
  lastTimerTick += elapsed * 1000;
  const { changed, completed } = window.ChefDomain.tickTimers(timers, elapsed);
  if (!changed) return;
  updateTimerDisplays();
  if (completed.length || now - lastTimerPersistAt >= 5000)
    persistCookingState(false);
  completed.forEach(announceTimerComplete);
  if (!hasRunningTimer()) stopTimerTicker();
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
  const nextTimer = Number.isInteger(timer.stepIndex)
    ? timers.find(
        (candidate) =>
          candidate.source === "recipe" &&
          candidate.stepIndex === timer.stepIndex &&
          candidate.stepTimerIndex > (timer.stepTimerIndex ?? -1) &&
          !candidate.completed,
      )
    : null;
  const usesChinese = /[\u3400-\u9fff]/.test(
    `${timer.name}${nextTimer?.name || ""}${nextStep?.instruction || ""}`,
  );
  sayInstruction(
    nextTimer
      ? usesChinese
        ? `${timer.name}完成。完成食譜指定的動作後，按下一個計時器：${nextTimer.name}。`
        : `${timer.name} is finished. Complete the recipe action, then start the next timer: ${nextTimer.name}.`
      : nextStep
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

window.addEventListener("pagehide", () => {
  if (activeRecipe) persistCookingState();
});

startApp();
