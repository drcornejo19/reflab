import { createClient } from "@supabase/supabase-js";
import {
  authorizeIsolatedSupabaseTarget,
  SKIPPED_ISOLATED_TARGET_MESSAGE,
} from "./isolated-supabase-target.mjs";

const target = authorizeIsolatedSupabaseTarget([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]);
if (!target.allowed) {
  console.log(SKIPPED_ISOLATED_TARGET_MESSAGE);
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
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

const { error: rpcError } = await supabase.rpc("admin_set_user_plan", {
  actor_user_id: "diagnostic_invalid_actor",
  target_user_id: "diagnostic_invalid_target",
  new_plan_key: "basic",
  change_reason: "schema verification without writes",
});

if (
  rpcError?.message !== "Only a canonical Super Admin can change plans"
) {
  failed = true;
  console.error(
    `[FAIL] RPC admin_set_user_plan inesperada: ${rpcError?.message ?? "sin error"}`
  );
} else {
  console.log("[PASS] RPC admin_set_user_plan canónica y sin escrituras.");
}

if (failed) {
  throw new Error("La reconciliación administrativa no está completa.");
}

console.log("Verificación del esquema administrativo completada.");
