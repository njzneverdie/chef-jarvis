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

  root.ChefDomain = Object.freeze({
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
    ingredientWeightInGrams,
    calculateUsdaMealNutrition,
    compareNutritionEstimates,
    localDateKey,
    safeExternalUrl,
    curatedRecipeImage,
  });
})(globalThis);
