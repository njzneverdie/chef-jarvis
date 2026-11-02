import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

test("account deletion is authenticated, cascaded, and disclosed", async () => {
  const [migration, edge, app, privacy, config] = await Promise.all([
    readFile(
      new URL(
        "supabase/migrations/20260718090000_link_text_profiles_to_auth_users.sql",
        rootUrl,
      ),
      "utf8",
    ),
    readFile(
      new URL("supabase/functions/chef-delete-account/index.ts", rootUrl),
      "utf8",
    ),
    readFile(new URL("public/app.js", rootUrl), "utf8"),
    readFile(new URL("PRIVACY.md", rootUrl), "utf8"),
    readFile(new URL("supabase/config.toml", rootUrl), "utf8"),
  ]);

  assert.match(migration, /alter column app_user_id type uuid/i);
  const alterTypeIndex = migration.search(/alter table public\.app_profiles[\s\S]*alter column app_user_id type uuid/i);
  for (const policy of [
    "netlify_profile_insert_own",
    "netlify_profile_select_own",
    "netlify_profile_update_own",
    "netlify_saved_cards_delete_own",
    "netlify_saved_cards_insert_own",
    "netlify_saved_cards_select_own",
    "netlify_saved_cards_update_own",
  ]) {
    const dropIndex = migration.indexOf(`drop policy if exists ${policy}`);
    assert.ok(dropIndex >= 0, `migration must drop legacy policy ${policy}`);
    assert.ok(
      dropIndex < alterTypeIndex,
      `${policy} must be dropped before app_user_id changes type`,
    );
  }
  assert.match(
    migration,
    /references auth\.users\s*\(id\)\s*on delete cascade/i,
  );
  assert.match(migration, /auth\.uid\(\)\)\s*=\s*app_user_id/i);
  assert.match(edge, /authorization\?\.startsWith\("Bearer "\)/);
  assert.match(edge, /confirmation !== "DELETE"/);
  assert.match(edge, /auth\.admin\.deleteUser\(user\.id,\s*false\)/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(app, /id="delete-account"/);
  assert.match(app, /functions\/v1\/chef-delete-account/);
  assert.match(app, /confirmation:\s*"DELETE"/);
  assert.match(app, /localStorage\.removeItem/);
  assert.match(privacy, /retained until you delete your account/i);
  assert.match(privacy, /permanently deletes/i);
  assert.match(config, /project_id = "chef-jarvis"/);
});
