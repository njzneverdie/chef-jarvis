const durationPattern =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|小時|分鐘|秒鐘?|秒)/gi;
const ambiguousDurationPattern =
  /\d+(?:\.\d+)?\s*(?:-|–|—|~|～|至|到)\s*\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?|小時|分鐘|秒鐘?|秒)/i;
const requiredTimerActionPattern =
  /\b(?:preheat|cook|bake|roast|sear|fry|grill|broil|simmer|boil|steam|poach|braise|stew|microwave|toast)\b|(?:預熱|烹煮|煮|煎|烤|炸|炒|爆香|煸香|燉|燜|蒸|煨|加熱|收汁)/i;

export function instructionDurations(instruction) {
  const durations = [];
  for (const match of String(instruction || "").matchAll(durationPattern)) {
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

export function instructionIncludesDuration(instruction, durationSeconds) {
  return instructionDurations(instruction).includes(durationSeconds);
}

export function instructionHasAmbiguousDuration(instruction) {
  return ambiguousDurationPattern.test(String(instruction || ""));
}

export function instructionHasTimedCookingAction(instruction) {
  return /\b(?:preheat|cook|bake|roast|sear|fry|grill|broil|simmer|boil|steam|rest|marinate|chill|refrigerate|freeze|proof|cool|soak|reheat|warm|reduce|toast|blanch|poach|braise|stew|smoke|microwave|flip|turn|stir|wait)\b|(?:預熱|烹煮|煮|煎|烤|炸|炒|爆香|煸香|燉|燜|蒸|煨|滾|沸騰|靜置|醒麵|休息|醃|冷藏|冷凍|發酵|放涼|冷卻|浸泡|加熱|收汁|翻面|翻轉|攪拌|等待)/i.test(
    String(instruction || ""),
  );
}

export function instructionRequiresTimer(instruction) {
  const actionableText = String(instruction || "")
    .replace(
      /(?:已|事先|預先)(?:經)?(?:煮|煎|炒|烤|炸|燉|燜|蒸|煨|加熱)(?:好|熟|過|香)(?:的)?/g,
      "",
    )
    .replace(
      /(?:煮|煎|炒|烤|炸|燉|燜|蒸|煨|加熱)(?:好|熟|過|香)的/g,
      "",
    );
  return requiredTimerActionPattern.test(actionableText);
}

export function recipeStepTimerIssues(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.flatMap((step, index) => {
    const instruction = typeof step?.instruction === "string"
      ? step.instruction
      : "";
    if (!instruction) return [];
    if (instructionHasAmbiguousDuration(instruction)) {
      return [
        `steps[${index}].instruction must use one exact duration, not a range`,
      ];
    }
    if (
      instructionRequiresTimer(instruction) &&
      !instructionDurations(instruction).length
    ) {
      return [
        `steps[${index}].instruction must state an exact duration for its cooking action`,
      ];
    }
    return [];
  });
}

export function recipeTimerKindFromInstruction(instruction) {
  const text = String(instruction || "");
  if (/\bpreheat\b|預熱/i.test(text)) return "preheat";
  if (/\b(?:bake|roast)\b|烘烤|烤箱/i.test(text)) return "bake";
  if (/\b(?:simmer|braise|stew|reduce)\b|燉|燜|煨|收汁/i.test(text))
    return "simmer";
  if (/\b(?:boil|poach)\b|煮沸|水煮/i.test(text)) return "boil";
  if (/\bsteam\b|蒸/i.test(text)) return "steam";
  if (/\brest\b|靜置|休息/i.test(text)) return "rest";
  if (/\b(?:marinate|soak)\b|醃|浸泡/i.test(text)) return "marinate";
  if (/\b(?:chill|refrigerate|freeze)\b|冷藏|冷凍/i.test(text))
    return "chill";
  if (/\bproof\b|發酵|醒麵/i.test(text)) return "proof";
  if (/\bcool\b|放涼|冷卻/i.test(text)) return "cool";
  return "cook";
}

export function recipeTimersFromInstruction(instruction) {
  if (
    !instructionHasTimedCookingAction(instruction) ||
    isNonCookingTimerTask(instruction, "")
  ) {
    return [];
  }
  const durations = instructionDurations(instruction);
  const normalizedInstruction = String(instruction || "")
    .replace(/\s+/g, " ")
    .trim();
  const shortInstruction =
    normalizedInstruction.length > 82
      ? `${normalizedInstruction.slice(0, 81)}…`
      : normalizedInstruction;
  return durations.map((durationSeconds, index) => ({
    label:
      durations.length > 1
        ? `${shortInstruction} (${index + 1}/${durations.length})`
        : shortInstruction,
    kind: recipeTimerKindFromInstruction(instruction),
    duration_seconds: durationSeconds,
  }));
}

export function isNonCookingTimerTask(instruction, label) {
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

export function recipeTimerRejectionReason({
  instruction,
  label,
  durationSeconds,
}) {
  if (isNonCookingTimerTask(instruction, label)) {
    return "timer is not a cooking timer";
  }
  if (!instructionIncludesDuration(instruction, durationSeconds)) {
    return "timer must match its instruction";
  }
  return null;
}
