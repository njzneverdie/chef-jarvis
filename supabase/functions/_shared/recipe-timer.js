const durationPattern =
  /(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?|小時|分鐘|秒鐘?|秒)/gi;

export function instructionIncludesDuration(instruction, durationSeconds) {
  for (const match of String(instruction || "").matchAll(durationPattern)) {
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

export function recipeTimerRejectionReason({
  instruction,
  label,
  durationSeconds,
}) {
  if (
    /^(?:read|review|look at|check)\b|^(?:閱讀|朗讀|查看|看|檢查)(?:食譜|菜單|步驟)/i.test(
      String(label || ""),
    )
  ) {
    return "timer is not a cooking timer";
  }
  if (!instructionIncludesDuration(instruction, durationSeconds)) {
    return "timer must match its instruction";
  }
  return null;
}
