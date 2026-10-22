import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const rolesSql = readFileSync(
  resolve(repositoryRoot, "supabase", "roles.sql"),
  "utf8"
);
const baselineSql = readFileSync(
  resolve(
    repositoryRoot,
    "supabase",
    "migrations",
    "202607270000_reflab_canonical_baseline.sql"
  ),
  "utf8"
);

const normalizeSql = (value) => value.replace(/\s+/g, " ").trim();

function getFunctionDefinition(schema, name) {
  const pattern = new RegExp(
    `create function ${schema}\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    "i"
  );
  const definition = baselineSql.match(pattern)?.[0];

  assert.ok(definition, `Missing ${schema}.${name} function definition.`);
  return definition;
}

test("the RLS helper owner remains a restricted NOLOGIN role", () => {
  assert.match(
    normalizeSql(rolesSql),
    /create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;/i
  );
  assert.doesNotMatch(
    rolesSql,
    /alter\s+role\s+reflab_rls_owner[\s\S]*\b(login|superuser|createdb|createrole|bypassrls)\b/i
  );
});

test("the RLS helper owner receives no grants on auth", () => {
  assert.doesNotMatch(
    rolesSql,
    /grant\s+[\s\S]*?\bon\s+(?:schema|table|function)\s+auth\b/i
  );
  assert.doesNotMatch(
    baselineSql,
    /grant\s+[\s\S]*?\bon\s+(?:schema|table|function)\s+auth\b/i
  );
  assert.doesNotMatch(
    `${rolesSql}\n${baselineSql}`,
    /grant\s+[\s\S]*?\bin\s+schema\s+auth\b/i
  );
});

test("request_user_id reads claims defensively without auth.jwt", () => {
  const definition = getFunctionDefinition(
    "reflab_private",
    "request_user_id"
  );
  const normalized = normalizeSql(definition);

  assert.doesNotMatch(definition, /\bauth\.jwt\s*\(/i);
  assert.match(
    normalized,
    /current_setting\('request\.jwt\.claims', true\)/i
  );
  assert.match(
    normalized,
    /coalesce\( nullif\( pg_catalog\.btrim\( pg_catalog\.current_setting\('request\.jwt\.claims', true\) \), '' \), '\{\}' \)::pg_catalog\.jsonb/i
  );
  assert.match(normalized, /security invoker/i);
  assert.match(normalized, /set search_path = pg_catalog/i);
});

test("SECURITY DEFINER authorization helpers retain a safe search_path", () => {
  const helperNames = [
    "is_super_admin",
    "has_active_institution_membership",
    "has_institution_permission",
    "can_access_user_data",
  ];

  for (const helperName of helperNames) {
    const definition = normalizeSql(
      getFunctionDefinition("reflab_private", helperName)
    );

    assert.match(definition, /security definer/i);
    assert.match(definition, /set search_path = pg_catalog/i);
    assert.doesNotMatch(definition, /\bauth\.jwt\s*\(/i);
  }
});

test("the helper owner receives only the required direct helper execution", () => {
  const directExecuteGrants = [
    ...baselineSql.matchAll(
      /grant\s+execute\s+on\s+function\s+([^;]+?)\s+to\s+reflab_rls_owner\s*;/gi
    ),
  ]
    .map((match) => normalizeSql(match[1]))
    .sort();

  assert.deepEqual(directExecuteGrants, [
    "reflab_private.request_user_id()",
  ]);
});
