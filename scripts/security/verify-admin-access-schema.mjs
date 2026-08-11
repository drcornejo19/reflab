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

const openApiResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
  method: "GET",
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    accept: "application/openapi+json, application/json",
  },
  cache: "no-store",
});

if (!openApiResponse.ok) {
  failed = true;
  console.error(`[FAIL] inventario RPC: HTTP ${openApiResponse.status}`);
} else {
  const openApi = await openApiResponse.json();
  const expectedRpcPaths = [
    "/rpc/admin_set_canonical_user_plan",
    "/rpc/admin_set_canonical_global_role",
  ];

  for (const rpcPath of expectedRpcPaths) {
    if (!openApi?.paths?.[rpcPath]?.post) {
      failed = true;
      console.error(`[FAIL] RPC canonica ausente: ${rpcPath}`);
    } else {
      console.log(`[PASS] RPC canonica expuesta a service_role: ${rpcPath}.`);
    }
  }
}

if (failed) {
  throw new Error("La reconciliacion administrativa no esta completa.");
}

console.log("Verificacion read-only del esquema administrativo completada.");
