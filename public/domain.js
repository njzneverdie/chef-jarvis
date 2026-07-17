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

  function instructionIncludesDuration(instruction, durationSeconds) {
    const matches = instruction.matchAll(
      /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|小時|分鐘|秒鐘?|秒)/gi,
    );
    for (const match of matches) {
      const value = Number(match[1]);
      const unit = match[2].toLowerCase();
      const multiplier = /^(?:hours?|hrs?|小時)$/.test(unit)
        ? 3600
        : /^(?:minutes?|mins?|分鐘)$/.test(unit)
          ? 60
          : 1;
      if (Math.round(value * multiplier) === durationSeconds) return true;
    }
    return false;
  }

  function normalizeRecipeSteps(steps) {
    if (!Array.isArray(steps)) return [];
    return steps
      .map((step) => {
        if (typeof step === "string") {
          const instruction = step.trim();
          return instruction ? { instruction, timer: null } : null;
        }
        if (!step || typeof step !== "object") return null;
        const instruction = String(step.instruction || "").trim();
        if (!instruction) return null;
        if (!step.timer || typeof step.timer !== "object") {
          return { instruction, timer: null };
        }
        const label = String(step.timer.label || "").trim();
        const kind = String(step.timer.kind || "").trim();
        const duration = Math.round(Number(step.timer.duration_seconds));
        const isFakeTask =
          /^(?:read|review|look at|check)\b|^(?:閱讀|朗讀|查看|看|檢查)(?:食譜|菜單|步驟)/i.test(
            label,
          );
        const timer =
          label &&
          recipeTimerKinds.has(kind) &&
          Number.isFinite(duration) &&
          duration >= 30 &&
          duration <= 14400 &&
          instructionIncludesDuration(instruction, duration) &&
          !isFakeTask
            ? { label, kind, duration_seconds: duration }
            : null;
        return { instruction, timer };
      })
      .filter(Boolean);
  }

  function buildRecipeTimers(steps) {
    return normalizeRecipeSteps(steps).flatMap((step, stepIndex) => {
      if (!step.timer) return [];
      return [
        {
          name: step.timer.label,
          sec: step.timer.duration_seconds,
          duration: step.timer.duration_seconds,
          mode: "countdown",
          running: false,
          completed: false,
          source: "recipe",
          stepIndex,
          stepNumber: stepIndex + 1,
          timerKind: step.timer.kind,
        },
      ];
    });
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
    const displayUnit = usesChinese
      ? {
          tsp: "茶匙",
          tbsp: "湯匙",
          cup: "杯",
          piece: "個",
          clove: "瓣",
          slice: "片",
          can: "罐",
          pack: "包",
        }[unit] || unit
      : quantity === 1
        ? unit
        : {
            cup: "cups",
            piece: "pieces",
            clove: "cloves",
            slice: "slices",
            can: "cans",
            pack: "packs",
            portion: "portions",
          }[unit] || unit;
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
          茶匙: "tsp",
          湯匙: "tbsp",
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
    let estimatedConversions = 0;
    normalized.forEach((item) => {
      const food = matches.get(item.name.trim().toLocaleLowerCase());
      const weight = ingredientWeightInGrams(item);
      if (!food || !weight) return;
      matched += 1;
      if (weight.estimated) estimatedConversions += 1;
      const multiplier = weight.grams / 100;
      Object.keys(totals).forEach((key) => {
        const nutrient = Number(food.per100g[key]);
        if (Number.isFinite(nutrient)) totals[key] += nutrient * multiplier;
      });
    });
    Object.keys(totals).forEach((key) => {
      totals[key] = Math.round(totals[key] * 10) / 10;
    });
    return {
      ...totals,
      matched_ingredients: matched,
      total_ingredients: normalized.length,
      coverage_percent: normalized.length
        ? Math.round((matched / normalized.length) * 100)
        : 0,
      estimated_conversions: estimatedConversions,
      source: "USDA FoodData Central",
    };
  }

  function compareNutritionEstimates(usda, estimate, foods = []) {
    const differencePercent = (verified, expected) => {
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

  root.ChefDomain = Object.freeze({
    calculateTarget,
    tickTimers,
    normalizeRecipeSteps,
    buildRecipeTimers,
    normalizeIngredient,
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
    ingredientWeightInGrams,
    calculateUsdaMealNutrition,
    compareNutritionEstimates,
    localDateKey,
    safeExternalUrl,
  });
})(globalThis);
