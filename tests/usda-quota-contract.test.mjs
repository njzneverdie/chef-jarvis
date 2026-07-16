import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("USDA lookups consume a service-only per-user quota", async () => {
  const [edgeFunction, migration] = await Promise.all([
    readFile(
      new URL(
        "../supabase/functions/chef-usda-nutrition/index.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../supabase/migrations/20260716233533_add_usda_request_quota.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(edgeFunction, /consume_chef_usda_quota/);
  assert.match(edgeFunction, /status,[\s\S]*Retry-After/);
  assert.match(migration, /minute_count >= 3/);
  assert.match(migration, /day_count >= 30/);
  assert.match(
    migration,
    /revoke all on function public\.consume_chef_usda_quota\(uuid\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.consume_chef_usda_quota\(uuid\)[\s\S]*to service_role/,
  );
});
