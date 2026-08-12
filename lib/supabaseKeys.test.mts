import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createAuthenticatedSupabaseClient } from "./supabaseAuthenticated.ts";
import { createSupabaseAdminClient } from "./supabaseAdmin.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const legacyServerKeyName = [
  "SUPABASE",
  "SERVICE",
  "ROLE",
  "KEY",
].join("_");
const legacyPublicKeyName = [
  "NEXT",
  "PUBLIC",
  "SUPABASE",
  "ANON",
  "KEY",
].join("_");

test("the server client accepts an opaque Secret API Key", () => {
  withEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_synthetic-not-a-jwt",
      [legacyServerKeyName]: undefined,
    },
    () => {
      const client = createSupabaseAdminClient() as unknown as {
        supabaseKey: string;
      };
      assert.equal(client.supabaseKey, "sb_secret_synthetic-not-a-jwt");
    }
  );
});

test("the server client fails clearly without SUPABASE_SECRET_KEY", () => {
  withEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_SECRET_KEY: undefined,
      [legacyServerKeyName]: "legacy-value-must-not-be-used",
    },
    () => {
      assert.throws(
        () => createSupabaseAdminClient(),
        /Missing SUPABASE_SECRET_KEY/
      );
    }
  );
});

test("the authenticated client requires the publishable key", () => {
  withEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
      [legacyPublicKeyName]: "legacy-value-must-not-be-used",
    },
    () => {
      const client = createAuthenticatedSupabaseClient(
        async () => "synthetic-user-token"
      ) as unknown as { supabaseKey: string };
      assert.equal(client.supabaseKey, "sb_publishable_synthetic");
    }
  );

  withEnvironment(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      [legacyPublicKeyName]: "legacy-value-must-not-be-used",
    },
    () => {
      assert.throws(
        () => createAuthenticatedSupabaseClient(async () => null),
        /Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
      );
    }
  );
});

test("active code contains no legacy Supabase key names or JWT parsing", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter((file) =>
      /^(?:app|lib|scripts)\//.test(file) &&
      !/\.test\.m?[jt]s$/.test(file)
    );

  for (const file of tracked) {
    const source = readFileSync(resolve(repositoryRoot, file), "utf8");
    assert.doesNotMatch(source, new RegExp(legacyServerKeyName), file);
    assert.doesNotMatch(source, new RegExp(legacyPublicKeyName), file);

    if (source.includes("SUPABASE_SECRET_KEY")) {
      assert.doesNotMatch(
        source,
        /(?:jwtDecode|atob|base64|split\(\s*["']\.["']\s*\))/i,
        `${file} must treat the Secret API Key as opaque`
      );
    }
  }
});

test("the admin schema verifier uses supabase-js without manual bearer headers", () => {
  const source = readFileSync(
    resolve(
      repositoryRoot,
      "scripts/security/verify-admin-access-schema.mjs"
    ),
    "utf8"
  );

  assert.match(source, /createClient\(supabaseUrl, secretKey/);
  assert.match(source, /process\.env\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /authorization\s*:/i);
  assert.doesNotMatch(source, /Bearer\s*\$\{/);

  const migrationSql = readFileSync(
    resolve(
      repositoryRoot,
      "supabase/migrations/202608110001_canonical_admin_user_access.sql"
    ),
    "utf8"
  );
  for (const rpcName of [
    "admin_set_canonical_user_plan",
    "admin_set_canonical_global_role",
  ]) {
    assert.match(
      migrationSql,
      new RegExp(
        `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${rpcName}\\b`,
        "i"
      )
    );
    assert.match(
      migrationSql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${rpcName}\\b[\\s\\S]*?` +
          `grant\\s+execute\\s+on\\s+function\\s+public\\.${rpcName}\\b[\\s\\S]*?to\\s+service_role`,
        "i"
      )
    );
  }
});

function withEnvironment(
  values: Record<string, string | undefined>,
  callback: () => void
) {
  const previous = new Map(
    Object.keys(values).map((name) => [name, process.env[name]])
  );

  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}
