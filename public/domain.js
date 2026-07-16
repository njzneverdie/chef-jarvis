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
    return /^(?:no preparation|none|n\/a|無需處理|不需處理|无需处理)$/i.test(
      preparation,
    )
      ? ""
      : preparation;
  }

  function ingredientDetails(item) {
    const ingredient = normalizeIngredient(item);
    const preparation = ingredientPreparation(ingredient);
    return preparation
      ? `${ingredient.amount} · ${preparation}`
      : ingredient.amount;
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
    ingredientDetails,
    safeExternalUrl,
  });
})(globalThis);
