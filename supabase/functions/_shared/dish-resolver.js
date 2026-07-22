import { isBroadMealRequest } from "./recipe-variety.js";

const aliasGroups = [
  {
    canonicalName: "肉燥飯",
    pattern: /^(?:肉燥飯|肉躁飯|滷肉飯|卤肉饭|魯肉飯|鲁肉饭|lu rou fan)$/i,
    aliases: ["肉燥飯", "肉躁飯", "滷肉飯", "魯肉飯", "lu rou fan", "minced pork rice"],
    coreIngredientGroups: [[
      "ground pork", "minced pork", "pork mince", "豬絞肉", "猪绞肉",
      "豬肉末", "猪肉末", "豬肉碎", "猪肉碎", "絞豬肉", "绞猪肉",
      "pork belly", "pork shoulder", "ground pork shoulder", "五花肉",
      "豬五花", "猪五花", "豬肩肉", "猪肩肉",
    ]],
    coreTechniqueTerms: [
      "braise", "simmer", "stew", "slow cook", "滷", "卤", "燉", "炖",
      "燉煮", "炖煮", "燜", "焖", "燜煮", "焖煮", "熬", "熬煮",
      "煨", "煨煮", "慢煮", "滷煮", "卤煮",
    ],
  },
  {
    canonicalName: "波隆那千層麵",
    pattern: /^(?:波隆那(?:肉醬|肉酱)?千層麵|波隆那(?:肉醬|肉酱)?千层面|波隆尼亞(?:肉醬|肉酱)?千層麵|波隆尼亚(?:肉醬|肉酱)?千层面|lasagn[ae] alla bolognese|bolognese lasagn[ae]|lasagn[ae] bolognese)$/i,
    aliases: [
      "波隆那千層麵",
      "波隆那肉醬千層麵",
      "波隆尼亞千層麵",
      "Bolognese lasagna",
      "Lasagna alla Bolognese",
      "Lasagne alla Bolognese",
      "Lasagna Bolognese",
    ],
    coreIngredientGroups: [[
      "lasagna noodles", "lasagne sheets", "lasagna sheets",
      "pasta sheets", "fresh pasta sheets", "fresh egg pasta sheets",
      "千層麵片", "千层面片", "千層麵", "千层面",
      "義大利麵片", "意大利面片",
    ]],
    coreTechniqueTerms: [
      "layer", "layered", "assemble", "bake", "baked",
      "分層", "分层", "層疊", "层叠", "烘烤", "焗烤",
    ],
  },
];

function clean(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function canonicalIdentity(value) {
  return clean(value).toLocaleLowerCase();
}

const outerPunctuationPattern =
  /^[,，。.!！?？:：;；\s]+|[,，。.!！?？:：;；\s]+$/g;

const requestFramePrefixes = [
  /^(?:我想(?:請|请)你(?:幫我|帮我)?|我想(?:要|吃|做|煮)|(?:請|请|麻煩|麻烦)(?:你)?(?:幫我|帮我)?|幫我|帮我|我要|想吃|給我|给我|來|来)\s*/i,
  /^(?:推薦|推荐)(?:給|给)?(?:我)?\s*/i,
  /^(?:做|煮)\s*/i,
  /^(?:please|(?:can|could|would)\s+you(?:\s+please)?|i\s+(?:would|'d)\s+like(?:\s+to)?)\s+/i,
  /^(?:give\s+me|recommend|suggest)(?:\s+me)?\s+/i,
  /^(?:make|cook)(?:\s+me)?\s+/i,
  /^(?:(?:a|an|some)\s+)?(?:recipe|instructions)\s+(?:for\s+)?/i,
];

const requestFrameQuantifier =
  /^(?:(?:一份|一道|一個|一个|個|个)\s*|(?:a|an|some)\b\s*)/i;

const dishModifierPrefixes = [
  /^(?:(?:高蛋白|低脂|低卡|減脂|减脂|健康|快速|簡單|简单)\s*)+/i,
  /^(?:(?:high[\s-]?protein|low[\s-]?fat|low[\s-]?calorie|healthy|quick|easy)\s+)+/i,
];

function dishTargetDetails(value) {
  let target = clean(value).replace(outerPunctuationPattern, "");
  let frameMatched = false;
  let previous = "";
  while (target && target !== previous) {
    previous = target;
    for (const pattern of requestFramePrefixes) {
      const stripped = target.replace(pattern, "");
      if (stripped !== target) {
        target = stripped;
        frameMatched = true;
        break;
      }
    }
    if (frameMatched) target = target.replace(requestFrameQuantifier, "");
    for (const pattern of dishModifierPrefixes) {
      const stripped = target.replace(pattern, "");
      if (stripped !== target) {
        target = stripped;
        frameMatched = true;
        break;
      }
    }
    target = target
      .replace(/\s*(?:的)?(?:食譜|食谱|做法)$/i, "")
      .replace(/\s+(?:recipe|instructions)$/i, "")
      .replace(outerPunctuationPattern, "")
      .trim();
  }
  return { target, frameMatched };
}

function dishTarget(value) {
  return dishTargetDetails(value).target;
}

function isGenericMealTarget(value) {
  const target = clean(value).toLocaleLowerCase();
  if (!target) return true;
  if (/[\p{Script=Han}]/u.test(target)) {
    return /(?:早餐|早午餐|午餐|晚餐|宵夜|餐點|餐点|料理|菜色|菜單|菜单|食譜|食谱|便當|便当)$/.test(
      target,
    ) ||
      /^(?:(?:今天|今日|今晚)\s*)?(?:(?:早餐|早午餐|午餐|晚餐|宵夜)\s*)?(?:想)?(?:吃|煮|做)(?:點|点|些|個|个|道)?(?:什麼|什么)$/.test(
        target,
      );
  }
  return /^(?:(?:a|an|some)\s+)?(?:[\p{L}\p{N}-]+\s+)*(?:breakfast|brunch|lunch|dinner|meal|dish|recipe|idea|recommendation)s?$/iu.test(
    target,
  ) ||
    /^what\s+(?:should|can|could)\s+(?:i|we)\s+(?:eat|cook|make)(?:\s+for)?(?:\s+(?:breakfast|brunch|lunch|dinner))?(?:\s+(?:tonight|today))?$/i.test(
      target,
    ) ||
    /^what(?:'s| is)\s+for\s+(?:breakfast|brunch|lunch|dinner)(?:\s+(?:today|tonight))?$/i.test(
      target,
    );
}

function correctionText(value) {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function editDistance(left, right) {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function isPlausibleCorrection(original, proposed) {
  const left = correctionText(original);
  const right = correctionText(proposed);
  if (!left || !right) return false;
  if (left === right) return true;
  const originalTokens = clean(original).toLocaleLowerCase().match(/\p{L}+/gu) || [];
  const proposedTokens = clean(proposed).toLocaleLowerCase().match(/\p{L}+/gu) || [];
  if (
    /[\p{Script=Han}]/u.test(left + right) ||
    originalTokens.length !== proposedTokens.length ||
    !originalTokens.length
  ) return false;
  return originalTokens.every((token, index) => {
    const proposedToken = proposedTokens[index];
    if (token === proposedToken) return true;
    const longest = Math.max(token.length, proposedToken.length);
    return token.length >= 5 && proposedToken.length >= 5 &&
      token[0] === proposedToken[0] &&
      editDistance(token, proposedToken) <= Math.max(1, Math.floor(longest * 0.4));
  });
}

function isRelatedClarificationCandidate(original, candidate) {
  if (isPlausibleCorrection(original, candidate)) return true;
  const source = correctionText(original);
  const proposed = correctionText(candidate);
  if (!source || !proposed) return false;
  if (proposed.includes(source) || source.includes(proposed)) return true;
  if (/^[\p{Script=Han}]+$/u.test(source + proposed)) {
    const sourceCharacters = [...new Set(source)];
    const shared = sourceCharacters.filter((character) => proposed.includes(character));
    return shared.length / sourceCharacters.length >= 0.66;
  }
  const sourceTokens = clean(original).toLocaleLowerCase().match(/\p{L}+/gu) || [];
  const candidateTokens = clean(candidate).toLocaleLowerCase().match(/\p{L}+/gu) || [];
  return sourceTokens.some((token) => token.length >= 4 && candidateTokens.includes(token));
}

function curatedIdentityAliases(canonicalName) {
  const group = aliasGroups.find((candidate) => candidate.pattern.test(clean(canonicalName)));
  return group ? [group.canonicalName, ...group.aliases] : [];
}

function curatedCanonicalName(value) {
  const group = aliasGroups.find((candidate) => candidate.pattern.test(clean(value)));
  return group?.canonicalName || clean(value);
}

function curatedCoreIdentity(canonicalName) {
  const group = aliasGroups.find((candidate) =>
    clean(candidate.canonicalName) === clean(canonicalName)
  );
  return {
    coreIngredientGroups: group?.coreIngredientGroups || [],
    coreTechniqueTerms: group?.coreTechniqueTerms || [],
    coreEvidenceSource: group ? "curated" : "none",
  };
}

function normalizeCoreIngredientGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(Array.isArray)
    .map((group) => [...new Set(
      group.map(clean).filter((term) => term && term.length <= 80),
    )].slice(0, 6))
    .filter((group) => group.length)
    .slice(0, 4);
}

function normalizeCoreTechniqueTerms(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value.map(clean).filter((term) => term && term.length <= 80),
  )].slice(0, 8);
}

export function classifyMealRequest(request) {
  const originalRequest = clean(request);
  const { target, frameMatched } = dishTargetDetails(originalRequest);
  if (isGenericMealTarget(target)) return "broad_request";
  if (!isBroadMealRequest(originalRequest)) return "named_dish";
  if (
    !frameMatched ||
    isBroadMealRequest(target)
  ) {
    return "broad_request";
  }
  return "named_dish";
}

export function baselineDishResolution(request) {
  const originalRequest = clean(request);
  const target = dishTarget(originalRequest) || originalRequest;
  const group = aliasGroups.find(({ pattern }) => pattern.test(target));
  return {
    requestType: classifyMealRequest(originalRequest),
    originalRequest,
    displayName: originalRequest,
    canonicalName: group?.canonicalName || target,
    aliases: group?.aliases || [target],
    identityAliases: group
      ? [group.canonicalName, ...group.aliases]
      : [target],
    coreIngredientGroups: group?.coreIngredientGroups || [],
    coreTechniqueTerms: group?.coreTechniqueTerms || [],
    coreEvidenceSource: group ? "curated" : "none",
    confidence: group ? 1 : 0.8,
    needsClarification: false,
    clarificationCandidates: [],
  };
}

export function normalizeDishResolution(originalRequest, candidate = {}) {
  const baseline = baselineDishResolution(originalRequest);
  const confidence = Number(candidate.confidence);
  const canonicalName = clean(candidate.canonical_name);
  const proposedCanonicalName = curatedCanonicalName(canonicalName);
  const remapIsTrusted = !canonicalName ||
    canonicalIdentity(proposedCanonicalName) === canonicalIdentity(baseline.canonicalName);
  const needsClarification =
    (Number.isFinite(confidence) && confidence < 0.85) || !remapIsTrusted;
  const candidateValues = [
    ...(needsClarification && canonicalName ? [canonicalName] : []),
    ...(Array.isArray(candidate.candidates) ? candidate.candidates : []),
  ];
  const candidates = [...new Set(candidateValues
      .map(clean)
      .filter((value) => value && (
        isRelatedClarificationCandidate(baseline.canonicalName, value)
      ))
  )].slice(0, 3);
  const resolvedCanonicalName = needsClarification
    ? baseline.canonicalName
    : proposedCanonicalName || baseline.canonicalName;
  const modelAliases = Array.isArray(candidate.aliases)
    ? candidate.aliases.map(clean).filter(Boolean)
    : [];
  const identityAliases = resolvedCanonicalName === baseline.canonicalName
    ? baseline.identityAliases
    : [resolvedCanonicalName, ...curatedIdentityAliases(resolvedCanonicalName)];
  const curatedCore = curatedCoreIdentity(resolvedCanonicalName);
  const modelCoreIngredientGroups = normalizeCoreIngredientGroups(
    candidate.core_ingredient_groups,
  );
  const modelCoreTechniqueTerms = normalizeCoreTechniqueTerms(
    candidate.core_techniques,
  );
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
    identityAliases: [
      ...new Set(identityAliases.map(clean).filter(Boolean)),
    ],
    coreIngredientGroups: curatedCore.coreIngredientGroups.length
      ? curatedCore.coreIngredientGroups
      : modelCoreIngredientGroups,
    coreTechniqueTerms: curatedCore.coreTechniqueTerms.length
      ? curatedCore.coreTechniqueTerms
      : modelCoreTechniqueTerms,
    coreEvidenceSource: curatedCore.coreIngredientGroups.length
      ? "curated"
      : (modelCoreIngredientGroups.length || modelCoreTechniqueTerms.length)
      ? "model_hint"
      : "none",
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
