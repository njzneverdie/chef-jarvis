// Every user-facing string of a plan as a path. usda_query, image_query and
// the unit/category/kind enums are machine fields and stay English;
// substitutions[].from mirrors an ingredient name and is remapped instead.
export function userFacingTextPaths(plan) {
  const paths = [["title"], ["summary"]];
  const list = (value) => (Array.isArray(value) ? value : []);
  list(plan?.ingredients).forEach((_item, index) => {
    paths.push(["ingredients", index, "name"], ["ingredients", index, "preparation"]);
  });
  const stepPaths = (prefix, steps) =>
    list(steps).forEach((step, index) => {
      paths.push([...prefix, index, "instruction"]);
      for (const key of ["doneness", "rescue"]) {
        if (typeof step?.[key] === "string") paths.push([...prefix, index, key]);
      }
      list(step?.timers).forEach((_timer, timerIndex) =>
        paths.push([...prefix, index, "timers", timerIndex, "label"])
      );
    });
  stepPaths(["steps"], plan?.steps);
  list(plan?.substitutions).forEach((substitution, index) => {
    paths.push(
      ["substitutions", index, "to"],
      ["substitutions", index, "preparation"],
      ["substitutions", index, "reason"],
    );
    stepPaths(["substitutions", index, "step_updates"], substitution?.step_updates);
  });
  list(plan?.equipment_adaptations).forEach((_item, index) => {
    for (const key of ["original", "alternative", "instructions", "why"]) {
      paths.push(["equipment_adaptations", index, key]);
    }
  });
  list(plan?.equipment_needed).forEach((_item, index) => paths.push(["equipment_needed", index]));
  list(plan?.reuse_ideas).forEach((idea, index) => {
    paths.push(["reuse_ideas", index, "title"], ["reuse_ideas", index, "why"]);
    list(idea?.uses).forEach((_use, useIndex) => paths.push(["reuse_ideas", index, "uses", useIndex]));
  });
  return paths;
}

export function textAtPath(value, path) {
  let current = value;
  for (const key of path) current = current?.[key];
  return typeof current === "string" ? current : "";
}

export function setTextAtPath(value, path, text) {
  let current = value;
  for (const key of path.slice(0, -1)) current = current[key];
  current[path[path.length - 1]] = text;
}

// One language per recipe: zh-TW text may contain no Latin letters except
// degree signs (180°C) and the app name the Chinese UI also uses; English
// text may contain no CJK.
export function textMatchesLanguage(text, language) {
  const value = String(text || "");
  if (language === "zh-TW") {
    return !/[A-Za-z]/.test(value.replace(/°\s?[CF]\b/g, "").replace(/\b(?:Chef\s+)?Jarvis\b/g, ""));
  }
  return !/[぀-ヿ㐀-鿿가-힯]/.test(value);
}

// allowedTitleTerms: an exact dish label the title is required to carry
// (a named request's canonical name), which may be in another language.
export function languageMismatchPaths(plan, language, allowedTitleTerms = []) {
  return userFacingTextPaths(plan).filter((path) => {
    let text = textAtPath(plan, path);
    if (path.length === 1 && path[0] === "title") {
      for (const term of allowedTitleTerms) {
        if (term) text = text.split(term).join("");
      }
    }
    return !textMatchesLanguage(text, language);
  });
}
