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
        "../supabase/migrations/20260717002929_count_usda_lookup_units.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(edgeFunction, /consume_chef_usda_quota/);
  assert.match(edgeFunction, /status,[\s\S]*Retry-After/);
  assert.match(edgeFunction, /p_lookup_count: searches\.length/);
  assert.match(edgeFunction, /pageSize: 8/);
  assert.match(edgeFunction, /bestFoodMatch\(query, payload\.foods \|\| \[\]\)/);
  assert.match(edgeFunction, /selected\.coverage >= 0\.5|best\.coverage >= 0\.5/);
  assert.match(edgeFunction, /match_score: selected\.score/);
  assert.match(edgeFunction, /chef_usda_lookup_completed/);
  assert.match(migration, /sum\(request_units\)/);
  assert.match(migration, /minute_units \+ requested_units > 60/);
  assert.match(migration, /day_units \+ requested_units > 300/);
  assert.match(
    migration,
    /revoke all on function public\.consume_chef_usda_quota\(uuid, integer\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.consume_chef_usda_quota\(uuid, integer\)[\s\S]*to service_role/,
  );
});
