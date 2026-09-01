import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSemanticAuditMigration } from "./semantic-audit-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const migration = resolve(
  directory,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "202608310004_production_adoption_semantic_audit.sql",
);

writeFileSync(migration, generateSemanticAuditMigration(), "utf8");

