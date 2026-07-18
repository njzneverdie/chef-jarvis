import { isBroadMealRequest } from "./recipe-variety.js";

const aliasGroups = [
  {
    canonicalName: "肉燥飯",
    pattern: /^(?:肉燥飯|滷肉飯|卤肉饭|魯肉飯|鲁肉饭|lu rou fan)$/i,
    aliases: ["肉燥飯", "滷肉飯", "魯肉飯", "lu rou fan", "minced pork rice"],
  },
];

function clean(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function hasHanCharacters(value) {
  return /\p{Script=Han}/u.test(value);
}

function isSpecificModelAlias(alias, canonicalName) {
  const cleanedAlias = clean(alias);
  const hanCharacters = cleanedAlias.match(/\p{Script=Han}/gu) || [];
  if (hanCharacters.length > 0) return hanCharacters.length > 1;

  const aliasWords = cleanedAlias.match(/[\p{L}\p{N}]+/gu) || [];
  if (aliasWords.length !== 1) return aliasWords.length > 1;

  const cleanedCanonicalName = clean(canonicalName);
  const canonicalWords = cleanedCanonicalName.match(/[\p{L}\p{N}]+/gu) || [];
  return !hasHanCharacters(cleanedCanonicalName) && canonicalWords.length === 1;
}

export function classifyMealRequest(request) {
  return isBroadMealRequest(clean(request)) ? "broad_request" : "named_dish";
}

export function baselineDishResolution(request) {
  const originalRequest = clean(request);
  const group = aliasGroups.find(({ pattern }) => pattern.test(originalRequest));
  return {
    requestType: classifyMealRequest(originalRequest),
    originalRequest,
    displayName: originalRequest,
    canonicalName: group?.canonicalName || originalRequest,
    aliases: group?.aliases || [originalRequest],
    confidence: group ? 1 : 0.8,
    needsClarification: false,
    clarificationCandidates: [],
  };
}

export function normalizeDishResolution(originalRequest, candidate = {}) {
  const baseline = baselineDishResolution(originalRequest);
  const confidence = Number(candidate.confidence);
  const candidates = Array.isArray(candidate.candidates)
    ? candidate.candidates.map(clean).filter(Boolean).slice(0, 3)
    : [];
  const canonicalName = clean(candidate.canonical_name);
  const needsClarification = Number.isFinite(confidence) && confidence < 0.85;
  const resolvedCanonicalName = needsClarification
    ? baseline.canonicalName
    : canonicalName || baseline.canonicalName;
  const modelAliases = Array.isArray(candidate.aliases)
    ? candidate.aliases.map(clean).filter((alias) =>
      isSpecificModelAlias(alias, resolvedCanonicalName)
    )
    : [];
  const needsDescription = needsClarification && candidates.length === 0;
  return {
    ...baseline,
    canonicalName: resolvedCanonicalName,
    aliases: [
      ...new Set([
        ...modelAliases,
        ...baseline.aliases,
      ].filter(Boolean)),
    ].slice(0, 8),
    confidence: Number.isFinite(confidence) ? confidence : baseline.confidence,
    needsClarification,
    needsDescription,
    clarificationCandidates: needsClarification ? candidates : [],
  };
}

export function dishSearchTerms(resolution) {
  return [
    resolution.canonicalName,
    ...(resolution.aliases || []),
  ].map(clean).filter((value, index, values) =>
    value && values.indexOf(value) === index
  ).slice(0, 4);
}
