import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateSemanticAuditTeardown, PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT } from "./phase2a-semantic-audit-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
writeFileSync(resolve(root, PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT), generateSemanticAuditTeardown(), "utf8");
