const explicitMenuSeparator = /[、,;\n\r+]+/u;

function normalizeRequest(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[^\S\r\n]+/g, " ")
    .trim();
}

function cleanItem(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.!！?？:：\s]+|[.!！?？:：\s]+$/g, "");
}

export function parseMenuRequest(
  value,
  { maximumItems = 6, maximumItemLength = 160 } = {},
) {
  const originalRequest = normalizeRequest(value);
  const dishes = [];
  const identities = new Set();

  for (const rawItem of originalRequest.split(explicitMenuSeparator)) {
    const dish = cleanItem(rawItem);
    if (!dish) continue;
    if (dish.length > maximumItemLength) {
      return {
        kind: "invalid",
        originalRequest,
        dishes,
        code: "invalid_menu_item",
      };
    }
    const identity = dish.toLocaleLowerCase();
    if (identities.has(identity)) continue;
    identities.add(identity);
    dishes.push(dish);
  }

  if (dishes.length > maximumItems) {
    return {
      kind: "invalid",
      originalRequest,
      dishes,
      code: "menu_too_large",
    };
  }

  return {
    kind: dishes.length > 1 ? "menu" : "single",
    originalRequest,
    dishes: dishes.length ? dishes : [originalRequest],
  };
}
