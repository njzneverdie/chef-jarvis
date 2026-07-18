function normalizeDishText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "")
    .trim();
}

export function namedDishRejectionReason(plan, resolution) {
  if (resolution?.requestType !== "named_dish") return "";

  const title = normalizeDishText(plan?.title);
  const names = [resolution.canonicalName, ...(resolution.aliases || [])]
    .map(normalizeDishText)
    .filter(Boolean);
  const matches = names.some((name) => title === name || title.includes(name));

  return matches
    ? ""
    : `Generated title "${plan?.title || ""}" does not match named dish "${resolution.canonicalName}".`;
}

const repairablePatterns = [
  /^steps\[\d+\]\.instruction must state an exact duration/,
  /^steps\[\d+\]\.instruction must use one exact duration/,
  /^ingredients\[\d+\]\.(?:quantity|unit|preparation|category) /,
  /^substitutions\[\d+\]\./,
];

export function recipeValidationDisposition(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return repairablePatterns.some((pattern) => pattern.test(message))
    ? "repairable"
    : "fatal";
}

export function remainingTimeout(deadlineAt, capMs, now = Date.now()) {
  return Math.max(0, Math.min(capMs, deadlineAt - now));
}

export function buildRecipeRepairPrompt({
  canonicalName,
  rawText,
  validationMessage,
  schemaText,
}) {
  return [
    `The requested dish is exactly: ${canonicalName}.`,
    `Validation failed with: ${validationMessage}`,
    "Repair only the rejected fields; do not change the dish identity.",
    "Return only JSON matching this schema:",
    schemaText,
    "Invalid JSON to repair:",
    rawText,
  ].join("\n\n");
}
