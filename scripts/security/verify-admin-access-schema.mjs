import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  authorizeIsolatedSupabaseTarget,
  SKIPPED_ISOLATED_TARGET_MESSAGE,
} from "./isolated-supabase-target.mjs";

const target = authorizeIsolatedSupabaseTarget([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
]);
if (!target.allowed) {
  console.log(SKIPPED_ISOLATED_TARGET_MESSAGE);
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const probes = [
  [
    "platform_roles",
    "role_key,label,description,is_active,created_at,updated_at",
  ],
  [
    "access_plans",
    "plan_key,label,audience,description,is_active,created_at,updated_at",
  ],
  [
    "capabilities",
    "capability_key,label,description,category,is_active,created_at,updated_at",
  ],
  [
    "user_global_roles",
    "user_id,role_key,source,assigned_by_user_id,created_at,updated_at",
  ],
  [
    "user_subscriptions",
    "user_id,plan_key,status,source,assigned_by_user_id,created_at,updated_at",
  ],
  [
    "access_change_audit",
    "id,actor_user_id,target_user_id,action,old_data,new_data,created_at",
  ],
];

let failed = false;

for (const [table, columns] of probes) {
  const { error } = await supabase.from(table).select(columns).limit(1);

  if (error) {
    failed = true;
    console.error(`[FAIL] ${table}: ${error.code} ${error.message}`);
  } else {
    console.log(`[PASS] esquema reconciliado: ${table}.`);
  }
}

const migrationSql = readFileSync(
  resolve(
    "supabase/migrations/202608110001_canonical_admin_user_access.sql"
  ),
  "utf8"
);
const expectedRpcNames = [
  "admin_set_canonical_user_plan",
  "admin_set_canonical_global_role",
];

for (const rpcName of expectedRpcNames) {
  const escapedName = rpcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const contract = new RegExp(
    `create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${escapedName}\\b[\\s\\S]*?` +
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${escapedName}\\b[\\s\\S]*?` +
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${escapedName}\\b[\\s\\S]*?to\\s+service_role`,
    "i"
  );

  if (!contract.test(migrationSql)) {
    failed = true;
    console.error(`[FAIL] contrato RPC canonico incompleto: ${rpcName}.`);
  } else {
    console.log(`[PASS] contrato RPC canonico versionado: ${rpcName}.`);
  }
}

if (failed) {
  throw new Error("La reconciliacion administrativa no esta completa.");
}

console.log("Verificacion read-only del esquema administrativo completada.");
