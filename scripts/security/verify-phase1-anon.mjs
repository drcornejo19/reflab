import { createClient } from "@supabase/supabase-js";
import {
  authorizeIsolatedSupabaseTarget,
  SKIPPED_ISOLATED_TARGET_MESSAGE,
} from "./isolated-supabase-target.mjs";

const target = authorizeIsolatedSupabaseTarget([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]);
if (!target.allowed) {
  console.log(SKIPPED_ISOLATED_TARGET_MESSAGE);
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, publicKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const protectedReads = [
  ["user_profiles", "user_id,email,subscription_plan"],
  ["user_roles", "user_id,role,subscription_plan"],
  ["user_global_roles", "user_id,role_key"],
  ["user_subscriptions", "user_id,plan_key,status"],
  ["attempts", "id,user_id,score"],
  ["exam_results", "id,user_id"],
  ["rules_exam_results", "id,user_id"],
];

let failed = false;

for (const [table, columns] of protectedReads) {
  const { data, error } = await supabase.from(table).select(columns).limit(1);

  if (error && !isExpectedAccessDenial(error)) {
    failed = true;
    console.error(
      `[FAIL] no se pudo verificar ${table}: ${error.code ?? "sin codigo"} ${error.message}`
    );
  } else if (!error && (data?.length ?? 0) > 0) {
    failed = true;
    console.error(`[FAIL] anon obtuvo filas de ${table}.`);
  } else {
    console.log(`[PASS] anon no puede leer filas de ${table}.`);
  }
}

if (failed) {
  throw new Error(
    "La verificacion anonima fallo. No despliegues hasta corregir RLS."
  );
}

console.log("Verificacion anonima de Fase 1 completada.");

function isExpectedAccessDenial(error) {
  return error.code === "42501";
}
