import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Every tr("English", "中文") pair in the web app: the English side has no
// CJK and the Chinese side has no Latin letters (the app name Jarvis and
// °C/°F aside). Template expressions are ignored.
test("web tr() copy keeps each language pure", async () => {
  const pairs = [];
  for (const file of ["app.js", "chef-mode.js"]) {
    const source = await readFile(new URL(`../public/${file}`, import.meta.url), "utf8");
    const pattern = /\btr\(\s*(["`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(["`])((?:\\.|(?!\3)[^\\])*)\3\s*\)/g;
    for (const match of source.matchAll(pattern)) pairs.push({ file, en: match[2], zh: match[4] });
  }
  const strip = (text) => text.replace(/\$\{[^}]*\}/g, "").replace(/\bJarvis\b/g, "").replace(/°[CF]/g, "");
  for (const { file, en, zh } of pairs) {
    assert.doesNotMatch(strip(en), /[㐀-鿿]/, `${file}: English copy contains CJK: ${en}`);
    assert.doesNotMatch(strip(zh), /[A-Za-z]/, `${file}: Chinese copy contains Latin letters: ${zh}`);
  }
});
