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
        return { instruction, timers };
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
