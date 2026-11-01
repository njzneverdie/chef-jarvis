(function exposeChefDomain(root) {
  const bounds = {
    kcal: [800, 6000],
    protein: [0, 500],
    carbs: [0, 1000],
    fat: [0, 400],
  };

  function calculateTarget(values) {
    const bounded = (name, value) => {
      const number = Number(value);
      const [minimum, maximum] = bounds[name];
      if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new Error(
          `Enter a valid ${name} target (${minimum}–${maximum}).`,
        );
      }
      return Math.round(number);
    };

    if (values.mode === "custom") {
      return {
        kcal: bounded("kcal", values.kcal),
        protein: bounded("protein", values.protein),
        carbs: bounded("carbs", values.carbs),
        fat: bounded("fat", values.fat),
      };
    }

    const weight = Number(values.weight);
    const height = Number(values.height);
    const age = Number(values.age);
    if (![weight, height, age].every(Number.isFinite)) {
      throw new Error("Complete height, weight, and age with valid numbers.");
    }

    const sexAdjustment = values.sex === "male" ? 5 : -161;
    const bmr = 10 * weight + 6.25 * height - 5 * age + sexAdjustment;
    const activityFactor =
      { low: 1.25, moderate: 1.45, high: 1.65 }[values.activity] || 1.45;
    let kcal = Math.round(bmr * activityFactor);
    if (values.goal === "fat_loss") kcal -= 350;
    if (values.goal === "muscle_gain") kcal += 250;
    kcal = Math.max(1200, kcal);
    const protein = Math.max(
      0,
      Math.round(weight * (values.goal === "muscle_gain" ? 2 : 1.8)),
    );
    const fat = Math.max(0, Math.round((kcal * 0.27) / 9));
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    return { kcal, protein, carbs, fat };
  }

  function tickTimers(timers, elapsed) {
    const completed = [];
    let changed = false;
    timers.forEach((timer) => {
      if (!timer.running) return;
      changed = true;
      if (timer.mode === "stopwatch") {
        timer.sec += elapsed;
        return;
      }
      timer.sec = Math.max(0, timer.sec - elapsed);
      if (timer.sec === 0) {
        timer.running = false;
        timer.completed = true;
        completed.push(timer);
      }
    });
    return { changed, completed };
  }

  const recipeTimerKinds = new Set([
    "preheat",
    "cook",
    "bake",
    "simmer",
    "boil",
    "steam",
    "rest",
    "marinate",
    "chill",
    "proof",
    "cool",
  ]);

  function instructionDurations(instruction) {
    const durations = [];
    for (const match of String(instruction || "").matchAll(
      /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|小時|分鐘|秒鐘?|秒)/gi,
    )) {
      const value = Number(match[1]);
      const unit = match[2].toLowerCase();
      const multiplier = /^(?:hours?|hrs?|小時)$/.test(unit)
        ? 3600
        : /^(?:minutes?|mins?|分鐘)$/.test(unit)
          ? 60
          : 1;
      durations.push(Math.round(value * multiplier));
    }
    return durations;
  }

  function instructionHasTimedCookingAction(instruction) {
    return /\b(?:preheat|cook|bake|roast|sear|fry|grill|broil|simmer|boil|steam|rest|marinate|chill|refrigerate|freeze|proof|cool|soak|reheat|warm|reduce|toast|blanch|poach|braise|stew|smoke|microwave|flip|turn|stir|wait)\b|(?:預熱|烹煮|煮|煎|烤|炸|炒|燉|燜|蒸|煨|滾|沸騰|靜置|醒麵|休息|醃|冷藏|冷凍|發酵|放涼|冷卻|浸泡|加熱|收汁|翻面|翻轉|攪拌|等待)/i.test(
      String(instruction || ""),
    );
  }

  function isNonCookingTimerTask(instruction, label) {
    const content = `${instruction || ""} ${label || ""}`;
    return (
      /\b(?:read|review|study|browse|look at|check|familiarize|plan)\b[\s\S]{0,50}\b(?:recipe|menu|instructions?|steps?)\b|\b(?:recipe|menu|instructions?|steps?)\b[\s\S]{0,50}\b(?:read|review|study|browse|check)\b/i.test(
        content,
      ) ||
      /(?:閱讀|朗讀|查看|瀏覽|熟悉|檢查|研究|先看)[\s\S]{0,30}(?:食譜|菜單|料理步驟|步驟|recipe)|(?:食譜|菜單|料理步驟|步驟)[\s\S]{0,30}(?:閱讀|朗讀|查看|瀏覽|熟悉|檢查|研究|先看)/i.test(
        content,
      ) ||
      !instructionHasTimedCookingAction(instruction)
    );
  }

  function normalizeRecipeSteps(steps) {
    if (!Array.isArray(steps)) return [];
    return steps
      .map((step) => {
        if (typeof step === "string") {
          const instruction = step.trim();
          return instruction ? { instruction, timers: [] } : null;
        }
        if (!step || typeof step !== "object") return null;
        const instruction = String(step.instruction || "").trim();
        if (!instruction) return null;
        const rawTimers = Array.isArray(step.timers)
          ? step.timers
          : step.timer && typeof step.timer === "object"
            ? [step.timer]
            : [];
        const unmatchedDurations = instructionDurations(instruction);
        const timers = rawTimers.slice(0, 8).flatMap((rawTimer) => {
          if (!rawTimer || typeof rawTimer !== "object") return [];
          const label = String(rawTimer.label || "").trim();
          const kind = String(rawTimer.kind || "").trim();
          const duration = Math.round(Number(rawTimer.duration_seconds));
          const matchingDurationIndex = unmatchedDurations.indexOf(duration);
          if (
            !label ||
            !recipeTimerKinds.has(kind) ||
            !Number.isFinite(duration) ||
            duration < 1 ||
            duration > 14400 ||
            matchingDurationIndex < 0 ||
            isNonCookingTimerTask(instruction, label)
          )
            return [];
          unmatchedDurations.splice(matchingDurationIndex, 1);
          return [{ label, kind, duration_seconds: duration }];
        });
        const hint = (value, maximum) =>
          typeof value === "string" && value.trim() && value.trim().length <= maximum ? value.trim() : "";
        const doneness = hint(step.doneness, 80);
        const rescue = hint(step.rescue, 120);
        return {
          instruction,
          timers,
          ...(doneness ? { doneness } : {}),
          ...(rescue ? { rescue } : {}),
        };
      })
      .filter(Boolean);
  }

  function buildRecipeTimers(steps) {
    return normalizeRecipeSteps(steps).flatMap((step, stepIndex) => {
      return step.timers.map((timer, stepTimerIndex) => ({
          name: timer.label,
          sec: timer.duration_seconds,
          duration: timer.duration_seconds,
          mode: "countdown",
          running: false,
          completed: false,
          source: "recipe",
          stepIndex,
          stepNumber: stepIndex + 1,
          stepTimerIndex,
          timerKind: timer.kind,
        }));
    });
  }

  const zhUnitLabels = Object.freeze({
    g: "克",
    kg: "公斤",
    ml: "毫升",
    L: "公升",
    tsp: "茶匙",
    tbsp: "湯匙",
    cup: "杯",
    piece: "個",
    clove: "瓣",
    slice: "片",
    can: "罐",
    pack: "包",
    portion: "份",
  });
  const enPluralUnitLabels = Object.freeze({
    cup: "cups",
    piece: "pieces",
    clove: "cloves",
    slice: "slices",
    can: "cans",
    pack: "packs",
    portion: "portions",
  });

  // Display-only label for a stored unit enum; stored data keeps the enum.
  function unitLabel(unit, language = "en", quantity = null) {
    const value = String(unit || "").trim();
    if (language === "zh-TW") return zhUnitLabels[value] || value;
    return Number(quantity) === 1 ? value : enPluralUnitLabels[value] || value;
  }

  // Mirrors the Edge recipe-language rule: zh-TW text has no Latin letters
  // (°C/°F and the app name allowed), English text has no CJK.
  function textMatchesLanguage(text, language = "en") {
    const value = String(text || "");
    if (language === "zh-TW")
      return !/[A-Za-z]/.test(value.replace(/°\s?[CF]\b/g, "").replace(/\b(?:Chef\s+)?Jarvis\b/g, ""));
    return !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(value);
  }

  const pantryEntryUnits = [
    [/^(?:g|grams?|克|公克)$/i, "g"],
    [/^(?:kg|kilograms?|公斤|千克)$/i, "kg"],
    [/^(?:ml|cc|milliliters?|毫升)$/i, "ml"],
    [/^(?:l|liters?|litres?|公升|升)$/i, "L"],
    [/^(?:pcs?|pieces?|個|个|顆|颗|粒|隻|只)$/i, "piece"],
    [/^(?:packs?|包)$/i, "pack"],
    [/^(?:cans?|罐)$/i, "can"],
    [/^(?:slices?|片)$/i, "slice"],
    [/^(?:cloves?|瓣)$/i, "clove"],
    [/^(?:cups?|杯)$/i, "cup"],
    [/^(?:tsp|茶匙|小匙)$/i, "tsp"],
    [/^(?:tbsp|湯匙|汤匙|大匙)$/i, "tbsp"],
    [/^(?:把|瓶|盒|條|条|份|塊|块|串|bunch(?:es)?|bottles?|boxes?)$/i, null],
  ];
  const pantryUnitPattern = "kg|g|grams?|kilograms?|ml|cc|milliliters?|l|liters?|litres?|pcs?|pieces?|packs?|cans?|slices?|cloves?|cups?|tsp|tbsp|bunch(?:es)?|bottles?|boxes?|公斤|千克|公克|克|毫升|公升|升|個|个|顆|颗|粒|隻|只|包|罐|片|瓣|杯|茶匙|小匙|湯匙|汤匙|大匙|把|瓶|盒|條|条|份|塊|块|串";

  function pantryEntryUnit(raw) {
    const value = String(raw || "").trim();
    for (const [pattern, unit] of pantryEntryUnits) {
      if (pattern.test(value)) return unit || value.toLocaleLowerCase();
    }
    return null;
  }

  /**
   * Splits "鯛魚 300g、蛋 6顆, milk 1 L" into pantry rows. A token's own
   * amount wins (a bare number counts pieces); otherwise the form
   * quantity/unit apply, else 1 piece.
   * Recognized units become the shared unit enum; others (把, 瓶…) stay text.
   */
  function parsePantryEntries(text, defaults = {}) {
    const fallbackQuantity = Number(defaults.quantity);
    const hasFallback = Number.isFinite(fallbackQuantity) && fallbackQuantity > 0;
    const fallbackUnit = String(defaults.unit || "").trim() || "piece";
    const trailing = new RegExp(`^(.*?\\S)\\s*(\\d+(?:\\.\\d+)?)\\s*(${pantryUnitPattern})?$`, "i");
    const leading = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${pantryUnitPattern})?\\s+(\\S.*)$`, "i");
    const seen = new Set();
    const entries = [];
    for (const token of String(text || "").split(/[、,，;；/\n]+/)) {
      const clean = token.replace(/\s+/g, " ").trim();
      if (!clean) continue;
      let name = clean, quantity = null, unit = null;
      const tail = clean.match(trailing);
      const head = tail ? null : clean.match(leading);
      if (tail && /[^\d.\s]/.test(tail[1])) {
        [name, quantity, unit] = [tail[1], Number(tail[2]), tail[3]];
      } else if (head) {
        [quantity, unit, name] = [Number(head[1]), head[2], head[3]];
      }
      name = name.trim().slice(0, 120);
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const explicit = quantity != null && quantity > 0;
      entries.push({
        name,
        quantity: explicit ? quantity : hasFallback ? fallbackQuantity : 1,
        unit: explicit
          ? (unit && pantryEntryUnit(unit)) || "piece"
          : hasFallback ? fallbackUnit : "piece",
        explicit,
      });
    }
    return entries;
  }

  function normalizeIngredient(item = {}) {
    const name = String(item.name || "Ingredient").trim() || "Ingredient";
    const rawQuantity = item.quantity;
    const parsedQuantity =
      rawQuantity === "" || rawQuantity == null ? null : Number(rawQuantity);
    const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : null;
    const unit = String(item.unit || "").trim();
    const preparation = String(item.preparation || "").trim();
    const usesChinese = /[\u3400-\u9fff]/.test(`${name}${preparation}`);
    const displayUnit = unitLabel(unit, usesChinese ? "zh-TW" : "en", quantity);
    const amount =
      quantity != null && displayUnit
        ? `${quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${displayUnit}`
        : String(item.amount || "").trim();
    return {
      name,
      usda_query: String(item.usda_query || "").trim(),
      quantity,
      unit,
      amount,
      preparation,
      category: String(item.category || "other").trim() || "other",
    };
  }

  function recipeIntegrityReport(recipe = {}) {
    const issues = new Set();
    const ingredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : [];
    const genericIngredientPattern =
      /^(?:ingredient|ingredients|your selected ingredients|main protein(?: ingredient)?|fresh vegetables(?: and aromatics)?|seasonings?(?: to taste)?|食材|材料|適量|少許|酌量|調味料|配料|(?:這道料理的)?主要(?:蛋白質)?食材|新鮮蔬菜(?:與辛香料)?)$/i;

    if (!ingredients.length) issues.add("missing_ingredients");
    ingredients.forEach((rawItem) => {
      const rawName = String(rawItem?.name || "").trim();
      const ingredient = normalizeIngredient(rawItem);
      if (!rawName || genericIngredientPattern.test(rawName)) {
        issues.add("generic_ingredient");
      }
      if (
        ingredient.quantity == null ||
        ingredient.quantity <= 0 ||
        !ingredient.unit
      ) {
        issues.add("missing_measurement");
      }
    });
    if (!normalizeRecipeSteps(recipe.steps).length) {
      issues.add("missing_steps");
    }

    return {
      safe: issues.size === 0,
      issues: [...issues],
    };
  }

  function normalizeGroceryItem(item = {}) {
    const ingredient = normalizeIngredient(item);
    let { name, quantity, unit } = ingredient;

    const canonicalUnit = (value) => {
      const raw = String(value || "").trim();
      const normalized = raw.toLowerCase();
      return (
        {
          grams: "g",
          gram: "g",
          kilograms: "kg",
          kilogram: "kg",
          milliliters: "ml",
          milliliter: "ml",
          litres: "L",
          litre: "L",
          liters: "L",
          liter: "L",
          cups: "cup",
          pieces: "piece",
          pcs: "piece",
          pc: "piece",
          cloves: "clove",
          slices: "slice",
          cans: "can",
          packs: "pack",
          portions: "portion",
          克: "g",
          公克: "g",
          公斤: "kg",
          毫升: "ml",
          公升: "L",
          茶匙: "tsp",
          小匙: "tsp",
          湯匙: "tbsp",
          大匙: "tbsp",
          汤匙: "tbsp",
          杯: "cup",
          個: "piece",
          个: "piece",
          瓣: "clove",
          片: "slice",
          罐: "can",
          包: "pack",
          份: "portion",
        }[normalized] || raw
      );
    };

    unit = canonicalUnit(unit);
    if (quantity == null) {
      const amountMatch = String(ingredient.amount || "").match(
        /^(\d+(?:\.\d+)?)\s*(.*)$/,
      );
      if (amountMatch) {
        quantity = Number(amountMatch[1]);
        unit = canonicalUnit(amountMatch[2]);
      }
    }

    if (quantity == null) {
      const prefixedUnit = name.match(
        /^(\d+(?:\.\d+)?)\s*(kg|g|ml|l|tsp|tbsp|cups?|pieces?|pcs?|cloves?|slices?|cans?|packs?|portions?)\b[\s,:-]*(.+)$/i,
      );
      const prefixedCount = name.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
      if (prefixedUnit) {
        quantity = Number(prefixedUnit[1]);
        unit = canonicalUnit(prefixedUnit[2]);
        name = prefixedUnit[3].trim();
      } else if (prefixedCount) {
        quantity = Number(prefixedCount[1]);
        unit = "piece";
        name = prefixedCount[2].trim();
      }
    }

    if (quantity != null && !unit) unit = "piece";
    return normalizeIngredient({ ...ingredient, name, quantity, unit });
  }

  function applyIngredientSubstitution(item, substitution = {}) {
    const original = normalizeGroceryItem(item);
    return normalizeGroceryItem({
      ...original,
      name: String(substitution.to || original.name).trim() || original.name,
      usda_query:
        String(substitution.usda_query || "").trim() ||
        (/^[\x00-\x7F]+$/.test(String(substitution.to || ""))
          ? String(substitution.to || "").trim()
          : ""),
      quantity:
        substitution.quantity == null
          ? original.quantity
          : substitution.quantity,
      unit: substitution.unit || original.unit,
      preparation:
        substitution.preparation == null
          ? original.preparation
          : substitution.preparation,
      category: substitution.category || original.category,
      amount: "",
    });
  }

  function ingredientPreparation(item) {
    const preparation = normalizeIngredient(item).preparation;
    return /^(?:no preparation|none|n\/a|無處理|无需处理|無需處理|不需處理)$/i.test(
      preparation,
    )
      ? ""
      : preparation;
  }

  function recipeTitleAfterSubstitution(title, from, to) {
    const currentTitle = String(title || "").trim();
    const originalName = String(from || "").trim();
    const replacementName = String(to || "").trim();
    if (!currentTitle || !originalName || !replacementName) return currentTitle;
    if (
      currentTitle
        .toLocaleLowerCase()
        .includes(replacementName.toLocaleLowerCase())
    ) {
      return currentTitle;
    }

    const lowerTitle = currentTitle.toLocaleLowerCase();
    const lowerOriginal = originalName.toLocaleLowerCase();
    let matched = "";
    if (lowerTitle.includes(lowerOriginal)) {
      matched = originalName;
    } else if (/[^\x00-\x7f]/.test(originalName)) {
      for (
        let length = Math.min(originalName.length, currentTitle.length);
        length >= 2 && !matched;
        length -= 1
      ) {
        for (
          let start = 0;
          start + length <= originalName.length;
          start += 1
        ) {
          const candidate = originalName.slice(start, start + length);
          if (lowerTitle.includes(candidate.toLocaleLowerCase())) {
            matched = candidate;
            break;
          }
        }
      }
    } else {
      const words = originalName.split(/\s+/).filter(Boolean);
      for (let length = words.length; length >= 1 && !matched; length -= 1) {
        for (let start = 0; start + length <= words.length; start += 1) {
          const candidate = words.slice(start, start + length).join(" ");
          if (
            candidate.length >= 3 &&
            lowerTitle.includes(candidate.toLocaleLowerCase())
          ) {
            matched = candidate;
            break;
          }
        }
      }
    }

    if (matched) {
      const index = lowerTitle.indexOf(matched.toLocaleLowerCase());
      return `${currentTitle.slice(0, index)}${replacementName}${currentTitle.slice(index + matched.length)}`;
    }
    return /[^\x00-\x7f]/.test(currentTitle)
      ? `${currentTitle}（${replacementName}替換版）`
      : `${currentTitle} (${replacementName} version)`;
  }

  function ingredientDetails(item) {
    const ingredient = normalizeIngredient(item);
    const preparation = ingredientPreparation(ingredient);
    return preparation
      ? `${ingredient.amount} · ${preparation}`
      : ingredient.amount;
  }

  function quantityInBaseUnit(quantity, unit) {
    const value = Number(quantity);
    if (!Number.isFinite(value)) return null;
    const conversions = {
      g: ["mass", "g", 1],
      kg: ["mass", "g", 1000],
      ml: ["volume", "ml", 1],
      L: ["volume", "ml", 1000],
      tsp: ["volume", "ml", 5],
      tbsp: ["volume", "ml", 15],
      cup: ["volume", "ml", 240],
      piece: ["piece", "piece", 1],
      clove: ["clove", "clove", 1],
      slice: ["slice", "slice", 1],
      can: ["can", "can", 1],
      pack: ["pack", "pack", 1],
    };
    const conversion = conversions[String(unit || "")];
    if (!conversion) return null;
    return {
      family: conversion[0],
      unit: conversion[1],
      quantity: value * conversion[2],
    };
  }

  function convertQuantity(quantity, fromUnit, toUnit) {
    const source = quantityInBaseUnit(quantity, fromUnit);
    const target = quantityInBaseUnit(1, toUnit);
    if (!source || !target || source.family !== target.family) return null;
    return source.quantity / target.quantity;
  }

  function mergeGroceryItems(items) {
    const merged = new Map();
    (Array.isArray(items) ? items : []).forEach((rawItem) => {
      const item = normalizeGroceryItem(rawItem);
      const base = quantityInBaseUnit(item.quantity, item.unit);
      const unit = base?.unit || item.unit || "piece";
      const quantity = base?.quantity ?? item.quantity;
      const key = `${item.name.trim().toLocaleLowerCase()}|${unit}`;
      const current = merged.get(key);
      if (current && quantity != null) {
        current.quantity = Number(current.quantity || 0) + quantity;
        current.amount = "";
        return;
      }
      merged.set(
        key,
        normalizeGroceryItem({
          ...item,
          quantity,
          unit,
          amount: "",
        }),
      );
    });
    return [...merged.values()].map((item) =>
      normalizeGroceryItem({
        ...item,
        quantity:
          item.quantity == null
            ? null
            : Math.round(Number(item.quantity) * 100) / 100,
        amount: "",
      }),
    );
  }

  function scaleIngredientsForServings(
    ingredients,
    plannedServings,
    recipeServings,
  ) {
    const planned = Math.max(0.25, Number(plannedServings) || 1);
    const original = Math.max(0.25, Number(recipeServings) || 1);
    const multiplier = planned / original;
    return (Array.isArray(ingredients) ? ingredients : []).map((rawItem) => {
      const item = normalizeGroceryItem(rawItem);
      return normalizeGroceryItem({
        ...item,
        quantity:
          item.quantity == null
            ? null
            : Math.round(Number(item.quantity) * multiplier * 100) / 100,
        amount: "",
      });
    });
  }

  function groceryDisplayMeasurement(rawItem) {
    const item = normalizeGroceryItem(rawItem);
    if (item.quantity == null || item.unit !== "ml" || item.quantity >= 100)
      return { quantity: item.quantity, unit: item.unit };
    const unit = item.quantity >= 15 ? "tbsp" : "tsp";
    const quantity = convertQuantity(item.quantity, "ml", unit);
    return {
      quantity: Math.round(quantity * 10) / 10,
      unit,
    };
  }

  function ingredientWeightInGrams(rawItem) {
    const item = normalizeGroceryItem(rawItem);
    const base = quantityInBaseUnit(item.quantity, item.unit);
    if (!base) return null;
    if (base.family === "mass")
      return { grams: base.quantity, estimated: false };
    const name = `${item.name} ${item.usda_query}`.toLocaleLowerCase();
    if (base.family === "volume") {
      let density = 1;
      let estimated = true;
      if (/\b(?:oil|olive oil|sesame oil)\b|食用油|橄欖油|麻油/.test(name))
        density = 0.92;
      else if (/\b(?:honey|syrup)\b|蜂蜜|糖漿/.test(name)) density = 1.4;
      else if (/\b(?:flour|starch)\b|麵粉|澱粉/.test(name)) density = 0.55;
      else if (/\b(?:sugar)\b|砂糖|糖$/.test(name)) density = 0.85;
      else if (/\b(?:salt)\b|鹽$/.test(name)) density = 1.2;
      else if (
        /\b(?:water|milk|broth|stock|vinegar|soy sauce|sauce)\b|水|牛奶|高湯|醋|醬油|醬$/.test(
          name,
        )
      )
        estimated = false;
      return { grams: base.quantity * density, estimated };
    }
    if (base.family === "clove" && /garlic|蒜/.test(name))
      return { grams: base.quantity * 3, estimated: true };
    if (base.family === "piece" && /\begg\b|雞蛋|鸡蛋/.test(name))
      return { grams: base.quantity * 50, estimated: true };
    if (base.family === "slice" && /\bbread\b|吐司|麵包|面包/.test(name))
      return { grams: base.quantity * 28, estimated: true };
    if (base.family === "slice" && /\bcheese\b|起司|乳酪/.test(name))
      return { grams: base.quantity * 28, estimated: true };
    return null;
  }

  // ---- Beginner help: glossary, measures, badges, prep, rescue, feedback ----
  // [Chinese forms, English forms, Chinese explanation, English explanation]
  const cookingGlossary = [
    [["爆香"], ["until fragrant"], "用少量油以中小火炒蒜、薑、蔥等辛香料，炒到冒出香味。", "Cook aromatics such as garlic or ginger in a little oil until they smell fragrant."],
    [["勾芡"], ["slurry"], "把太白粉加冷水調勻，倒進湯汁拌勻，讓湯汁變濃稠。", "Starch mixed with cold water, stirred into hot liquid to thicken it."],
    [["收汁"], ["reduce", "reduced", "reducing"], "開大火讓湯汁蒸發變少、變濃，邊煮邊翻動避免燒焦。", "Boil uncovered so the liquid evaporates and thickens; stir so it does not burn."],
    [["汆燙", "川燙", "焯"], ["blanch", "blanched", "blanching"], "把食材放進滾水短暫燙熟或去血水，撈起瀝乾。", "Briefly boil food, then lift it out and drain it."],
    [["過油"], ["flash-fry", "flash-fried"], "把食材放進熱油快速炸一下就撈起，讓口感滑嫩或定型。", "Fry very briefly in hot oil, then lift out, to set the outside."],
    [["醃"], ["marinate", "marinated", "marinating"], "先把食材和調味料拌勻放一段時間，讓味道滲入。", "Coat food in seasoning and let it rest so the flavor soaks in."],
    [["煸"], ["dry-fry", "dry-fried"], "用中火把食材炒到出油、表面微乾微焦。", "Stir-fry over medium heat until the food releases its fat and browns slightly."],
    [["燜"], ["cover and cook"], "蓋上鍋蓋用小火慢慢煮，讓食材在鍋內熱氣中熟透。", "Cook covered over low heat so steam finishes the food."],
    [["燉"], ["braise", "braised", "braising"], "加入湯汁用小火長時間煮，讓食材軟爛入味。", "Cook slowly in liquid over low heat until tender."],
    [["切丁"], ["dice", "diced", "dicing"], "切成大小一致的小方塊，約 1 公分。", "Cut into even small cubes, about 1 cm."],
    [["切絲"], ["julienne", "julienned"], "切成像火柴棒粗細的細長條。", "Cut into thin matchstick strips."],
    [["切片"], ["slice thinly", "thinly sliced"], "切成厚度一致的薄片。", "Cut into thin slices of even thickness."],
    [["切末"], ["mince", "minced", "mincing"], "切到非常細碎。", "Chop very finely."],
    [["滾刀塊"], ["roll cut"], "邊切邊轉動食材，切出不規則斜塊，適合紅蘿蔔、茄子。", "Cut on an angle while rolling the vegetable a quarter turn each time."],
    [["拍蒜"], ["smash the garlic", "smashed garlic"], "用刀面把蒜瓣壓扁，比較好剝皮、香味也更容易出來。", "Press garlic flat with the side of a knife to peel it and release flavor."],
    [["去腥"], ["remove the gamey smell"], "用薑、蔥或米酒去除肉類或海鮮的腥味。", "Use ginger, scallion or rice wine to tone down strong meat or seafood smells."],
    [["中小火"], ["medium-low heat"], "火力介於中火與小火之間，火焰剛好在鍋底下方。", "Between medium and low; the flame sits just under the pan."],
    [["大火"], ["high heat"], "火焰碰到鍋底並向外散開，用來快炒或煮滾。", "The flame spreads across the pan bottom; used to stir-fry or boil."],
    [["中火"], ["medium heat"], "火焰剛好碰到鍋底，大部分烹調都用這個火力。", "The flame just touches the pan; used for most cooking."],
    [["小火"], ["low heat"], "火焰離鍋底有一點距離，用來燉煮或避免燒焦。", "The flame stays below the pan; used to simmer or avoid burning."],
    [["八分熟"], ["medium-rare"], "肉中心還帶一點粉紅色，比全熟少煮一點。", "Meat still slightly pink in the center, just short of fully done."],
    [["煎至金黃"], ["sear", "seared", "searing"], "用熱鍋把表面煎出金黃色，先不要一直翻動。", "Brown the surface in a hot pan without moving it too often."],
    [["小火慢煮"], ["simmer", "simmered", "simmering"], "保持鍋中小泡泡、不要大滾的狀態慢慢煮。", "Cook in liquid with small gentle bubbles, just below a boil."],
    [["翻炒"], ["sauté", "sautéed", "saute", "sauteed", "stir-fry", "stir-fried"], "用鍋鏟不斷翻動，讓食材均勻受熱。", "Keep tossing the food in a hot pan so it cooks evenly."],
    [["淋鍋邊"], ["deglaze", "deglazed"], "沿著熱鍋邊倒入液體，把鍋底焦香刮起來融入醬汁。", "Pour liquid into the hot pan and scrape up the browned bits."],
  ];

  function escapesRegExpText(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function cookingTermsIn(text, language = "en") {
    const value = String(text || "");
    const zh = language === "zh-TW";
    const found = [];
    for (const [zhTerms, enTerms, zhText, enText] of cookingGlossary) {
      for (const term of zh ? zhTerms : enTerms) {
        const pattern = zh
          ? new RegExp(escapesRegExpText(term), "g")
          : new RegExp(`(?<![\\p{L}-])${escapesRegExpText(term)}(?![\\p{L}])`, "giu");
        for (const match of value.matchAll(pattern)) {
          found.push({ start: match.index, end: match.index + match[0].length, text: match[0], explanation: zh ? zhText : enText });
        }
      }
    }
    return found;
  }

  const measureUnits = [
    [/^(?:茶匙|小匙|tsp|teaspoons?)$/i, "tsp"],
    [/^(?:湯匙|大匙|tbsp|tablespoons?)$/i, "tbsp"],
    [/^(?:杯|cups?)$/i, "cup"],
  ];

  // Volume measures in a step ("2 湯匙醬油", "1 cup water") with the
  // ingredient named right after them when it is in the recipe list.
  function stepMeasuresIn(text, ingredients = []) {
    const value = String(text || "");
    const pattern = /(\d+(?:\.\d+)?)\s*(茶匙|小匙|湯匙|大匙|杯|tsp|tbsp|teaspoons?|tablespoons?|cups?)(?![A-Za-z])/gi;
    const names = (Array.isArray(ingredients) ? ingredients : [])
      .filter((item) => item && typeof item === "object" && item.name)
      .sort((a, b) => String(b.name).length - String(a.name).length);
    const found = [];
    for (const match of value.matchAll(pattern)) {
      const unit = measureUnits.find(([test]) => test.test(match[2]))?.[1];
      if (!unit) continue;
      const after = value.slice(match.index + match[0].length, match.index + match[0].length + 24).toLocaleLowerCase();
      const ingredient = names.find((item) => after.replace(/^\s*(?:of\s+)?/, "").startsWith(String(item.name).toLocaleLowerCase())) || null;
      found.push({ start: match.index, end: match.index + match[0].length, text: match[0], quantity: Number(match[1]), unit, ingredient });
    }
    return found;
  }

  function measureHelp(quantity, unit, language = "en", ingredient = null) {
    const zh = language === "zh-TW";
    const ml = convertQuantity(quantity, unit, "ml");
    if (ml == null) return "";
    const weight = ingredient ? ingredientWeightInGrams({ ...ingredient, quantity, unit }) : null;
    const round = (value) => Math.round(value * 10) / 10;
    const household = {
      tsp: zh ? "沒有量匙時，約為一般小湯匙（咖啡匙）1 匙。" : "Without measuring spoons: about 1 small coffee spoon.",
      tbsp: zh ? "沒有量匙時，約為一般喝湯的湯匙 1 匙。" : "Without measuring spoons: about 1 regular soup spoon.",
      cup: zh ? "沒有量杯時，約為一般馬克杯的大半杯。" : "Without a measuring cup: about a mug filled most of the way.",
    }[unit] || "";
    const parts = [zh ? `約 ${round(ml)} 毫升` : `About ${round(ml)} ml`];
    if (weight && !(weight.estimated && !ingredient))
      parts.push(zh ? `${ingredient.name}約 ${round(weight.grams)} 克` : `${ingredient.name} about ${round(weight.grams)} g`);
    return `${parts.join(zh ? "，" : ", ")}${zh ? "。" : ". "}${household}`.trim();
  }

  // Ordered, non-overlapping tappable spans for a step instruction.
  function stepSegments(text, ingredients = [], language = "en") {
    const value = String(text || "");
    const spans = [
      ...stepMeasuresIn(value, ingredients).map((item) => ({ ...item, kind: "measure", help: measureHelp(item.quantity, item.unit, language, item.ingredient) })),
      ...cookingTermsIn(value, language).map((item) => ({ ...item, kind: "term", help: item.explanation })),
    ].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    const segments = [];
    let cursor = 0;
    for (const span of spans) {
      if (span.start < cursor || !span.help) continue;
      if (span.start > cursor) segments.push({ kind: "text", text: value.slice(cursor, span.start) });
      segments.push({ kind: span.kind, text: value.slice(span.start, span.end), help: span.help });
      cursor = span.end;
    }
    if (cursor < value.length) segments.push({ kind: "text", text: value.slice(cursor) });
    return segments;
  }

  // [id, Chinese name, English name, pattern]
  const cookwareKinds = [
    ["wok", "炒鍋", "wok", /炒鍋|\bwok\b/i],
    ["pan", "平底鍋", "frying pan", /平底鍋|煎鍋|\b(?:frying pan|skillet|non-stick pan)\b/i],
    ["pot", "湯鍋", "pot", /湯鍋|深鍋|\b(?:saucepan|stockpot|pot)\b/i],
    ["rice_cooker", "電鍋", "rice cooker", /電鍋|電子鍋|\brice cooker\b/i],
    ["oven", "烤箱", "oven", /烤箱|\boven\b/i],
    ["air_fryer", "氣炸鍋", "air fryer", /氣炸鍋|\bair fryer\b/i],
    ["steamer", "蒸籠", "steamer", /蒸籠|蒸鍋|\bsteamer\b/i],
    ["microwave", "微波爐", "microwave", /微波|\bmicrowave\b/i],
    ["sheet", "烤盤", "baking sheet", /烤盤|\bbaking (?:sheet|tray)\b/i],
  ];

  function recipeCookware(recipe) {
    const text = (Array.isArray(recipe?.steps) ? recipe.steps : []).map((step) => step?.instruction || "").join(" ");
    return cookwareKinds.filter(([, , , pattern]) => pattern.test(text)).map(([id, zh, en]) => ({ id, zh, en }));
  }

  // AI-provided badges when valid, otherwise derived from steps.
  function recipeBadges(recipe = {}) {
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    const text = steps.map((step) => step?.instruction || "").join(" ");
    const derivedPots = Math.max(1, recipeCookware(recipe).length);
    const pots = Number.isInteger(recipe.pots_used) && recipe.pots_used >= 1 && recipe.pots_used <= 6 ? recipe.pots_used : derivedPots;
    const advanced = /油炸|炸至|過油|勾芡|deep[- ]fr|flamb|temper|emulsif/i.test(text);
    const derivedDifficulty = Math.min(3, 1 + (steps.length > 6 ? 1 : 0) + (advanced || pots >= 3 ? 1 : 0));
    const difficulty = [1, 2, 3].includes(recipe.difficulty) ? recipe.difficulty : derivedDifficulty;
    const cleanup = ["low", "medium", "high"].includes(recipe.cleanup) ? recipe.cleanup : pots <= 1 ? "low" : pots === 2 ? "medium" : "high";
    return { difficulty, pots, cleanup };
  }

  function recipeBadgeText(recipe, language = "en") {
    const badges = recipeBadges(recipe);
    const zh = language === "zh-TW";
    const cleanup = { low: zh ? "少" : "light", medium: zh ? "中" : "medium", high: zh ? "多" : "heavy" }[badges.cleanup];
    return zh
      ? `難度 ${"★".repeat(badges.difficulty)}${"☆".repeat(3 - badges.difficulty)} · 用 ${badges.pots} 個鍋具 · 洗碗量${cleanup}`
      : `Difficulty ${"★".repeat(badges.difficulty)}${"☆".repeat(3 - badges.difficulty)} · ${badges.pots} ${badges.pots === 1 ? "pan" : "pans"} · ${cleanup} cleanup`;
  }

  // What to cut and which tools to get out before step 1.
  function prepChecklist(recipe = {}, language = "en") {
    const zh = language === "zh-TW";
    const items = [];
    (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const preparation = ingredientPreparation(item);
      if (preparation) items.push({ id: `prep-${index}`, kind: "prep", text: `${item.name}${zh ? "：" : ": "}${preparation}` });
    });
    const tools = Array.isArray(recipe.equipment_needed) && recipe.equipment_needed.length
      ? recipe.equipment_needed.map((name) => String(name)).filter(Boolean).slice(0, 8)
      : recipeCookware(recipe).map((tool) => zh ? tool.zh : tool.en);
    if (items.length) tools.unshift(zh ? "砧板與菜刀" : "cutting board and knife");
    [...new Set(tools)].forEach((name, index) => items.push({ id: `tool-${index}`, kind: "tool", text: zh ? `準備${name}` : `Get out the ${name}` }));
    return items;
  }

  function genericRescueTips(language = "en") {
    const zh = language === "zh-TW";
    return zh
      ? [
          ["太鹹", "加一點水或無鹽高湯稀釋，或多加一些沒調味的食材（例如蔬菜、豆腐）。"],
          ["太淡", "每次少量加鹽或醬油，攪拌後再試味道，不要一次加太多。"],
          ["燒焦", "立刻離火，把沒焦的部分移到乾淨鍋子，焦掉的鍋底不要刮進去。"],
          ["太油", "用廚房紙巾吸掉表面浮油，或搭配白飯、清燙蔬菜一起吃。"],
          ["太乾", "加一點水或高湯，蓋上鍋蓋用小火燜一下。"],
        ]
      : [
          ["Too salty", "Add a little water or unsalted stock, or more unseasoned ingredients such as vegetables or tofu."],
          ["Too bland", "Add salt or soy sauce a little at a time, stir, and taste again."],
          ["Burnt", "Take it off the heat at once and move the unburnt part to a clean pan; leave the burnt bottom."],
          ["Too oily", "Blot surface oil with paper towels, or serve with plain rice or blanched vegetables."],
          ["Too dry", "Add a splash of water or stock, cover, and cook on low heat briefly."],
        ];
  }

  const feedbackTagOptions = [
    ["too_salty", "Too salty", "太鹹"],
    ["too_bland", "Too bland", "太淡"],
    ["too_hard", "Too hard", "太難"],
    ["delicious", "Delicious", "很好吃"],
  ];

  // Ratings are required by the feedback table; quick tags alone map to one.
  function feedbackRatingForTags(tags = []) {
    if (!Array.isArray(tags) || !tags.length) return null;
    return tags.includes("delicious") && tags.length === 1 ? 5 : tags.includes("delicious") ? 4 : 3;
  }

  // Dishes the user has completed, excluding ones last marked too hard.
  function cookedDishes(logs = [], feedback = [], recipes = []) {
    const byTitle = new Map();
    for (const log of Array.isArray(logs) ? logs : []) {
      const title = String(log?.recipe_title || "").trim();
      if (!title) continue;
      const entry = byTitle.get(title) || { title, count: 0, last: "" };
      entry.count += 1;
      if (String(log.eaten_on || "") > entry.last) entry.last = String(log.eaten_on || "");
      byTitle.set(title, entry);
    }
    const latestFeedback = new Map();
    for (const row of [...(Array.isArray(feedback) ? feedback : [])].sort((a, b) => String(a?.created_at || "").localeCompare(String(b?.created_at || "")))) {
      if (row?.recipe_title) latestFeedback.set(String(row.recipe_title).trim(), row);
    }
    return [...byTitle.values()]
      .filter((entry) => !(latestFeedback.get(entry.title)?.tags || []).includes("too_hard"))
      .map((entry) => ({ ...entry, recipe: (Array.isArray(recipes) ? recipes : []).find((row) => String(row?.title || "").trim() === entry.title) || null }))
      .sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count);
  }

  const cookingSkillOptions = [
    ["beginner", "Beginner", "新手"],
    ["some", "Some experience", "會一點"],
    ["confident", "Confident", "熟練"],
  ];

  function calculateUsdaMealNutrition(ingredients, foods) {
    const normalized = (Array.isArray(ingredients) ? ingredients : []).map(
      normalizeGroceryItem,
    );
    const matches = new Map(
      (Array.isArray(foods) ? foods : [])
        .filter((food) => food?.found && food?.per100g)
        .map((food) => [
          String(food.ingredient || "")
            .trim()
            .toLocaleLowerCase(),
          food,
        ]),
    );
    const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    let matched = 0;
    let completeMatches = 0;
    const nutrientMatches = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    let estimatedConversions = 0;
    normalized.forEach((item) => {
      const food = matches.get(item.name.trim().toLocaleLowerCase());
      const weight = ingredientWeightInGrams(item);
      if (!food || !weight) return;
      const validKeys=Object.keys(totals).filter(key=>typeof food.per100g[key] === "number" && Number.isFinite(food.per100g[key]) && food.per100g[key]>=0);
      if(!validKeys.length)return;
      matched += 1;
      if(validKeys.length===4)completeMatches += 1;
      if (weight.estimated) estimatedConversions += 1;
      const multiplier = weight.grams / 100;
      validKeys.forEach((key) => {
        nutrientMatches[key] += 1;
        totals[key] += food.per100g[key] * multiplier;
      });
    });
    Object.keys(totals).forEach((key) => {
      totals[key] = nutrientMatches[key] ? Math.round(totals[key] * 10) / 10 : null;
    });
    return {
      ...totals,
      matched_ingredients: matched,
      complete: normalized.length>0 && completeMatches===normalized.length,
      nutrient_coverage_percent: Object.fromEntries(Object.keys(nutrientMatches).map(key=>[key,normalized.length?Math.round(nutrientMatches[key]/normalized.length*100):0])),
      total_ingredients: normalized.length,
      coverage_percent: normalized.length
        ? Math.round((completeMatches / normalized.length) * 100)
        : 0,
      estimated_conversions: estimatedConversions,
      source: "USDA FoodData Central",
    };
  }

  function hasCompleteUsdaNutrition(total) {
    return total?.complete===true && total.coverage_percent===100 && ["kcal","protein_g","carbs_g","fat_g"].every(key=>typeof total[key]==="number"&&Number.isFinite(total[key])&&total[key]>=0);
  }

  function compareNutritionEstimates(usda, estimate, foods = []) {
    const differencePercent = (verified, expected) => {
      if(verified==null||expected==null)return null;
      const reference = Number(expected);
      const measured = Number(verified);
      if (!Number.isFinite(reference) || reference <= 0 || !Number.isFinite(measured))
        return null;
      return Math.round((Math.abs(measured - reference) / reference) * 100);
    };
    const kcalDifference = differencePercent(usda?.kcal, estimate?.kcal);
    const proteinDifference = differencePercent(
      usda?.protein_g,
      estimate?.protein_g,
    );
    const lowConfidenceMatches = (Array.isArray(foods) ? foods : []).filter(
      (food) =>
        food?.found &&
        Number.isFinite(Number(food.match_score)) &&
        Number(food.match_score) < 70,
    ).length;
    return {
      kcal_difference_percent: kcalDifference,
      protein_difference_percent: proteinDifference,
      low_confidence_matches: lowConfidenceMatches,
      needs_review:
        (kcalDifference != null && kcalDifference > 35) ||
        (proteinDifference != null && proteinDifference > 40) ||
        lowConfidenceMatches > 0,
    };
  }

  function localDateKey(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function safeExternalUrl(value, hosts) {
    try {
      const url = new URL(String(value || ""));
      const allowed = Array.isArray(hosts)
        ? hosts.some(
            (host) =>
              url.hostname === host || url.hostname.endsWith(`.${host}`),
          )
        : false;
      return url.protocol === "https:" && allowed ? url.href : "";
    } catch {
      return "";
    }
  }

  function reconcileCookingRecipeReference(snapshot = {}, recipeId = null) {
    const authoritativeRecipeId = recipeId || null;
    return {
      ...snapshot,
      activeRecipe: snapshot.activeRecipe
        ? {
            ...snapshot.activeRecipe,
            saved_recipe_id: authoritativeRecipeId,
            cooking_session_persisted: true,
          }
        : snapshot.activeRecipe,
      activeRecipeId: authoritativeRecipeId,
    };
  }

  const curatedGrainBowlImage = Object.freeze({
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/BuddhaBowlLot.jpg/1280px-BuddhaBowlLot.jpg",
    description_url:
      "https://commons.wikimedia.org/wiki/File:BuddhaBowlLot.jpg",
    creator: "PizzaMan",
    license: "CC BY-SA 4.0",
    source: "Wikimedia Commons",
    query: "curated vegetable rice bowl",
    match_kind: "curated",
  });

  const curatedSalmonImage = Object.freeze({
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Salmon%2C_pan-seared_and_glazed%2C_with_Brussels_sprouts_and_root_vegetables_-_Massachusetts.jpg/1280px-Salmon%2C_pan-seared_and_glazed%2C_with_Brussels_sprouts_and_root_vegetables_-_Massachusetts.jpg",
    description_url:
      "https://commons.wikimedia.org/wiki/File:Salmon,_pan-seared_and_glazed,_with_Brussels_sprouts_and_root_vegetables_-_Massachusetts.jpg",
    creator: "Daderot",
    license: "CC0 1.0",
    source: "Wikimedia Commons",
    query: "curated pan-seared salmon photograph",
    match_kind: "curated",
  });

  function curatedRecipeImage(recipe = {}) {
    const text =
      `${recipe.title || ""} ${recipe.image_query || ""} ${recipe.summary || ""}`;
    if (/\bsalmon\b|鮭魚|鲑鱼/i.test(text)) {
      return { ...curatedSalmonImage };
    }
    return /\b(?:rice|grain|buddha)\s+bowl\b|\bchickpea\s+bowl\b|(?:蔬菜|鷹嘴豆|鹰嘴豆|素食)[\s\S]{0,12}(?:飯碗|饭碗|餐碗)/i.test(
      text,
    )
      ? { ...curatedGrainBowlImage }
      : null;
  }

  // One vocabulary drives both native and web planning. Values are allowlisted;
  // no user-authored prompt is needed to request a personalized recommendation.
  // Single-select groups are mutually exclusive; multi-select groups combine
  // freely and an empty selection means "no preference". Values are an
  // allowlist shared with the chef-meal-plan Edge function.
  const mealPlanningSections = [
    { key: "basics", en: "Basics", zh: "基本" },
    { key: "flavor", en: "Meal & cuisine", zh: "餐別與風味" },
    { key: "nutrition", en: "Nutrition goals", zh: "營養目標" },
    { key: "practical", en: "Practical needs", zh: "實用需求" },
    { key: "ingredients", en: "Main ingredient & staple", zh: "主食材與主食" },
    { key: "style", en: "Cooking style & taste", zh: "做法與口味" },
  ];
  const mealPlanningGroups = [
    { key: "servings", section: "basics", en: "How many servings?", zh: "準備幾人份？", options: [["1", "1", "1 人份"], ["2", "2", "2 人份"], ["3", "3", "3 人份"], ["4", "4", "4 人份"], ["6", "6", "6 人份"]] },
    { key: "time", section: "basics", en: "Time available", zh: "想花多少時間？", options: [["15", "15 min", "15 分鐘"], ["30", "30 min", "30 分鐘"], ["45", "45 min", "45 分鐘"], ["60", "60 min", "60 分鐘"], ["any", "No limit", "不限時間"]] },
    { key: "meal", section: "flavor", optional: true, en: "Meal", zh: "哪一餐？", options: [["breakfast", "Breakfast", "早餐"], ["lunch", "Lunch", "午餐"], ["dinner", "Dinner", "晚餐"], ["snack", "Snack", "點心"], ["late_night", "Late-night snack", "宵夜"]] },
    { key: "cuisine", section: "flavor", optional: true, multi: true, en: "Cuisine", zh: "想吃哪種風味？", options: [["taiwanese", "Taiwanese", "台式"], ["chinese_home", "Chinese home-style", "中式家常"], ["sichuan_hunan", "Sichuan & Hunan", "川湘"], ["cantonese", "Cantonese & Hong Kong", "粵式港式"], ["japanese", "Japanese", "日式"], ["korean", "Korean", "韓式"], ["thai", "Thai", "泰式"], ["vietnamese", "Vietnamese", "越式"], ["southeast_asian", "Southeast Asian", "東南亞"], ["indian", "Indian", "印度"], ["italian", "Italian", "義式"], ["french", "French", "法式"], ["american", "American", "美式"], ["mexican", "Mexican", "墨西哥"], ["mediterranean", "Mediterranean", "地中海"], ["middle_eastern", "Middle Eastern", "中東"]] },
    { key: "goals", section: "nutrition", optional: true, multi: true, en: "Nutrition goals", zh: "營養目標", options: [["high_protein", "High protein", "高蛋白"], ["low_carb", "Low carb", "低碳水"], ["low_fat", "Low fat", "低脂"], ["high_fiber", "High fiber", "高纖"], ["low_sodium", "Low sodium", "低鈉"], ["fat_loss", "Fat loss", "減脂"], ["muscle_gain", "Muscle gain", "增肌"], ["light", "Light", "清淡"]] },
    { key: "practical", section: "practical", optional: true, multi: true, en: "Practical needs", zh: "實用需求", options: [["use_pantry", "Use my pantry", "消耗庫存"], ["expiring_first", "Expiring items first", "即期食材優先"], ["few_dishes", "Fewer dishes to wash", "少洗鍋"], ["one_pot", "One pot", "一鍋到底"], ["lunchbox", "Lunchbox-friendly", "可做便當"], ["freezer", "Freezer meal prep", "可冷凍備餐"], ["budget", "Budget-friendly", "省錢"], ["beginner", "Beginner-friendly", "新手友善"]] },
    { key: "protein", section: "ingredients", optional: true, multi: true, en: "Main ingredient", zh: "主食材", options: [["chicken", "Chicken", "雞肉"], ["pork", "Pork", "豬肉"], ["beef", "Beef", "牛肉"], ["seafood", "Seafood", "海鮮"], ["fish", "Fish", "魚"], ["egg", "Eggs", "蛋"], ["tofu", "Tofu & soy", "豆腐豆製品"], ["plant", "Plant-based", "純素蔬食"]] },
    { key: "staple", section: "ingredients", optional: true, en: "Staple", zh: "主食", options: [["any", "Any", "不限"], ["rice", "Rice", "飯"], ["noodles", "Noodles", "麵"], ["no_starch", "No starch", "無澱粉"]] },
    { key: "method", section: "style", optional: true, multi: true, en: "Cooking method", zh: "料理方式", options: [["stir_fry", "Stir-fry", "快炒"], ["soup", "Soup", "湯品"], ["steam", "Steamed", "蒸"], ["oven", "Oven", "烤箱"], ["air_fryer", "Air fryer", "氣炸鍋"], ["braise", "Braised", "燉滷"], ["cold_dish", "Cold dish", "涼拌"], ["rice_cooker", "Rice cooker", "電鍋"]] },
    { key: "spice", section: "style", optional: true, en: "Spice level", zh: "辣度", options: [["any", "Any", "不限"], ["none", "Not spicy", "不辣"], ["mild", "Mild", "小辣"], ["medium", "Medium", "中辣"], ["hot", "Hot", "大辣"]] },
    { key: "mood", section: "style", optional: true, multi: true, en: "Mood", zh: "想要的感覺", options: [["warming", "Warming", "暖胃"], ["refreshing", "Refreshing", "清爽"], ["rice_friendly", "Great with rice", "下飯"], ["party", "For guests", "宴客"]] },
  ];
  const defaultMealPlanningChoices = Object.freeze({ servings: "1", time: "30", meal: "dinner", cuisine: [], goals: [], practical: [], protein: [], staple: "any", method: [], spice: "any", mood: [] });

  function normalizeMealPlanningChoices(choices = {}) {
    return Object.fromEntries(mealPlanningGroups.map(group => {
      const allowed = group.options.map(option => option[0]);
      const value = choices[group.key] ?? defaultMealPlanningChoices[group.key];
      if (group.multi) {
        const values = Array.isArray(value) ? value : [value].filter(item => item != null && item !== "");
        if (values.some(item => !allowed.includes(item))) throw new Error("Invalid meal planning choice: " + group.key);
        return [group.key, allowed.filter(item => values.includes(item))];
      }
      if (!allowed.includes(value)) throw new Error("Invalid meal planning choice: " + group.key);
      return [group.key, value];
    }));
  }

  function mealPlanningPicks(choices = {}, language = "en") {
    const selected = normalizeMealPlanningChoices(choices);
    const zh = language === "zh-TW";
    return mealPlanningGroups.flatMap(group => {
      if (group.key === "servings" || group.key === "time") return [];
      const values = group.multi ? selected[group.key] : [selected[group.key]];
      const labels = group.options
        .filter(([value]) => values.includes(value) && value !== "any")
        .map(option => option[zh ? 2 : 1]);
      return labels.length ? [{ key: group.key, label: zh ? group.zh.replace(/[？?]$/, "") : group.en.replace(/\?$/, ""), values: labels }] : [];
    });
  }

  // Structured picks for the Edge function (allowlisted ids, no free text).
  function buildMealPlanningPreferences(choices = {}) {
    const selected = normalizeMealPlanningChoices(choices);
    return Object.fromEntries(mealPlanningGroups
      .filter(group => group.key !== "servings" && group.key !== "time")
      .map(group => [group.key, selected[group.key]]));
  }

  function mealPlanningSummary(choices = {}, language = "en") {
    const selected = normalizeMealPlanningChoices(choices);
    const zh = language === "zh-TW";
    const time = selected.time === "any" ? (zh ? "不限時間" : "no time limit") : (zh ? `${selected.time} 分鐘內` : `≤ ${selected.time} min`);
    const head = zh ? `${selected.servings} 人份 · ${time}` : `${selected.servings} ${selected.servings === "1" ? "serving" : "servings"} · ${time}`;
    return [head, ...mealPlanningPicks(selected, language).map(pick => pick.values.join(zh ? "、" : ", "))].join(" · ");
  }

  function buildMealPlanningRequest(choices = {}, language = "en") {
    const selected = normalizeMealPlanningChoices(choices);
    const zh = language === "zh-TW";
    const time = selected.time;
    const core = zh
      ? `請推薦一道適合我的餐點，由你決定菜色。準備 ${selected.servings} 人份；${time === "any" ? "料理時間不限" : `總備料與烹調時間不超過 ${time} 分鐘`}。遵守已儲存的過敏原、飲食限制、器材與營養目標（與選項衝突時以個人設定為準）；避開近期重複菜色。`
      : `Recommend a personalized meal idea; choose the dish for me. Make exactly ${selected.servings} servings; ${time === "any" ? "no time limit" : `total preparation and cooking time at most ${time} minutes`}. Follow my saved allergies, dietary restrictions, equipment and nutrition goals (they win over any pick); avoid recent repeats.`;
    // Picks travel only as structured preferences: free text built from them
    // could read like a dish name and must never change the request type.
    return core;
  }

  root.ChefDomain = Object.freeze({
    mealPlanningSections,
    mealPlanningGroups,
    defaultMealPlanningChoices,
    normalizeMealPlanningChoices,
    buildMealPlanningRequest,
    buildMealPlanningPreferences,
    mealPlanningSummary,
    calculateTarget,
    tickTimers,
    normalizeRecipeSteps,
    buildRecipeTimers,
    normalizeIngredient,
    recipeIntegrityReport,
    normalizeGroceryItem,
    applyIngredientSubstitution,
    ingredientPreparation,
    recipeTitleAfterSubstitution,
    ingredientDetails,
    quantityInBaseUnit,
    convertQuantity,
    mergeGroceryItems,
    scaleIngredientsForServings,
    groceryDisplayMeasurement,
    unitLabel,
    textMatchesLanguage,
    parsePantryEntries,
    cookingTermsIn,
    stepMeasuresIn,
    measureHelp,
    stepSegments,
    recipeCookware,
    recipeBadges,
    recipeBadgeText,
    prepChecklist,
    genericRescueTips,
    feedbackTagOptions,
    feedbackRatingForTags,
    cookedDishes,
    cookingSkillOptions,
    ingredientWeightInGrams,
    calculateUsdaMealNutrition,
    hasCompleteUsdaNutrition,
    compareNutritionEstimates,
    localDateKey,
    safeExternalUrl,
    reconcileCookingRecipeReference,
    curatedRecipeImage,
  });
})(globalThis);
