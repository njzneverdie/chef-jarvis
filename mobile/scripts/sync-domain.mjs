import { copyFile, readFile } from "node:fs/promises";
const source = new URL("../../public/domain.js", import.meta.url);
const target = new URL("../src/shared-domain.js", import.meta.url);
if (process.argv.includes("--check")) {
  if (!(await readFile(source)).equals(await readFile(target)))
    throw new Error("Shared domain differs; run npm run sync:domain");
} else await copyFile(source, target);
