import fs from "node:fs";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

loadLocalEnvironment();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !publicKey) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y la clave publica de Supabase."
  );
}

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

  if (!error && (data?.length ?? 0) > 0) {
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

function loadLocalEnvironment() {
  if (!fs.existsSync(".env.local")) return;

  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
