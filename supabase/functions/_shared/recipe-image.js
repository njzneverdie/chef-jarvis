const familyPatterns = {
  fried_rice:
    /\bfried\s+rice\b|\bnasi\s+goreng\b|炒飯|炒饭|蛋炒飯|蛋炒饭|チャーハン/i,
  grain_bowl:
    /\b(?:rice|grain|buddha)\s+bowl\b|\bchickpea\s+bowl\b|(?:蔬菜|鷹嘴豆|鹰嘴豆|素食)[\s\S]{0,12}(?:飯碗|饭碗|餐碗)/i,
  pasta:
    /\bpasta\b|\bspaghetti\b|\bpenne\b|\blasagn(?:a|e)\b|\bfettuccine\b|\blinguine\b|義大利麵|意大利面|千層麵|千层面/i,
  noodles:
    /\bnoodles?\b|\bramen\b|\budon\b|\bsoba\b|麵條|面条|拉麵|拉面|烏龍麵|乌冬面/i,
  pizza: /\bpizza\b|披薩|披萨/i,
  salad: /\bsalad\b|沙拉/i,
  soup: /\bsoup\b|\bbisque\b|\bchowder\b|湯|汤|羹/i,
  steak: /\bsteak\b|\bribeye\b|\bsirloin\b|牛排/i,
  curry: /\bcurry\b|咖哩|咖喱/i,
  dumpling: /\bdumplings?\b|\bgyoza\b|水餃|水饺|餃子|饺子/i,
  sandwich: /\bsandwich\b|\btoast\b|\bburger\b|三明治|吐司|漢堡|汉堡/i,
  chicken: /\bchicken\b|雞肉|鸡肉|雞胸|鸡胸|雞腿|鸡腿/i,
  fish: /\bfish\b|\bsalmon\b|\bcod\b|\btuna\b|魚|鱼|鮭魚|鲑鱼|鱈魚|鳕鱼/i,
};

export function dishImageFamily(value) {
  const text = String(value || "");
  return (
    Object.entries(familyPatterns).find(([, pattern]) => pattern.test(text))
      ?.[0] || ""
  );
}

export function imageCandidateMatchesFamily(family, value) {
  if (!family || !familyPatterns[family]) return true;
  const text = String(value || "");
  if (!familyPatterns[family].test(text)) return false;
  return !Object.entries(familyPatterns).some(
    ([otherFamily, pattern]) =>
      otherFamily !== family &&
      [
        "fried_rice",
        "grain_bowl",
        "pasta",
        "noodles",
        "pizza",
        "salad",
        "soup",
      ].includes(otherFamily) &&
      pattern.test(text),
  );
}

const nonPhotographicImagePattern =
  /\b(?:clip[\s-]?art|cartoon|illustration|drawing|icon|diagram|vector|logo|emoji|render(?:ing)?|silhouette|sticker)\b|剪貼畫|剪贴画|卡通|插圖|插图|圖示|图示|示意圖|示意图/i;

export function imageCandidateLooksPhotographic(value) {
  return !nonPhotographicImagePattern.test(String(value || ""));
}

function simplifiedImageQuery(value) {
  return String(value || "")
    .replace(
      /\b(?:high[- ]protein|low[- ]carb|low[- ]sodium|healthy|quick|easy|one[- ]pot|Taiwanese-style)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function familyFallbackQuery(family, combined) {
  const text = String(combined || "");
  if (family === "fried_rice") {
    if (/\bchicken\b|雞|鸡/i.test(text)) return "chicken egg fried rice";
    return "egg fried rice";
  }
  return {
    grain_bowl: "Buddha bowl rice vegetables",
    pasta: "Italian pasta dish",
    noodles: "Asian noodle dish",
    pizza: "pizza",
    salad: "fresh salad",
    soup: "soup bowl",
    steak: "seared steak",
    curry: "curry dish",
    dumpling: "dumplings",
    sandwich: "sandwich",
    chicken: "cooked chicken dish",
    fish: "cooked fish dish",
  }[family] || "";
}

export function recipeImageQueryPlan({
  imageQuery = "",
  title = "",
  request = "",
} = {}) {
  const exactQuery = String(imageQuery || title || request).trim();
  const combined = `${request} ${title} ${exactQuery}`.trim();
  const family = dishImageFamily(combined);
  const candidates = [
    { query: exactQuery, match_kind: "exact" },
    { query: simplifiedImageQuery(exactQuery), match_kind: "exact" },
    {
      query: familyFallbackQuery(family, combined),
      match_kind: "representative",
    },
  ]
    .map((candidate) => ({
      ...candidate,
      query: String(candidate.query || "").trim(),
    }))
    .filter(
      (candidate, index, values) =>
        candidate.query &&
        values.findIndex((item) => item.query === candidate.query) === index,
    )
    .slice(0, 3);
  return {
    family,
    queries: candidates.map((candidate) => candidate.query),
    candidates,
  };
}

const curatedGrainBowlImage = Object.freeze({
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/BuddhaBowlLot.jpg/1280px-BuddhaBowlLot.jpg",
  description_url: "https://commons.wikimedia.org/wiki/File:BuddhaBowlLot.jpg",
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

export function curatedRecipeImage({
  family = "",
  imageQuery = "",
  title = "",
  request = "",
} = {}) {
  const resolvedFamily =
    family || dishImageFamily(`${request} ${title} ${imageQuery}`);
  const combined = `${request} ${title} ${imageQuery}`;
  if (resolvedFamily === "fish" && /\bsalmon\b|鮭魚|鲑鱼/i.test(combined)) {
    return { ...curatedSalmonImage };
  }
  return resolvedFamily === "grain_bowl" ? { ...curatedGrainBowlImage } : null;
}
