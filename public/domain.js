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
      : unit;
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
    normalizeIngredient,
    ingredientPreparation,
    ingredientDetails,
    safeExternalUrl,
  });
})(globalThis);
