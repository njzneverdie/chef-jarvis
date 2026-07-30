import { readdir } from "node:fs/promises";

const deploymentMetadata = new Set(["_headers"]);

export async function discoverReleasePublicFiles(directoryUrl, prefix = "") {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (deploymentMetadata.has(entry.name)) continue;
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      files.push(
        ...await discoverReleasePublicFiles(
          new URL(`${entry.name}/`, directoryUrl),
          `${relative}/`,
        ),
      );
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort();
}
