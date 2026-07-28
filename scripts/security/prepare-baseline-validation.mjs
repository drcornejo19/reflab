import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\..+/, "")
  .replace("T", "-");
const target = resolve(
  process.argv[2] ??
    join(tmpdir(), `reflab-baseline-validation-${timestamp}`)
);
const normalizedTemp = `${resolve(tmpdir())}${sep}`.toLowerCase();

if (!`${target}${sep}`.toLowerCase().startsWith(normalizedTemp)) {
  throw new Error("Validation directory must be created inside the OS temp directory.");
}
if (existsSync(target)) {
  throw new Error(`Validation directory already exists: ${basename(target)}.`);
}

const files = [
  {
    source: "supabase/validation/config.toml",
    destination: "supabase/config.toml",
  },
  {
    source: "supabase/roles.sql",
    destination: "supabase/roles.sql",
  },
  {
    source:
      "supabase/migrations/202607270000_reflab_canonical_baseline.sql",
    destination:
      "supabase/migrations/202607270000_reflab_canonical_baseline.sql",
  },
  {
    source: "supabase/seed/development_seed.sql",
    destination: "supabase/seed/development_seed.sql",
  },
  {
    source: "supabase/baseline/manifest.json",
    destination: "supabase/baseline/manifest.json",
  },
  {
    source: "scripts/security/validate-canonical-baseline.mjs",
    destination: "scripts/security/validate-canonical-baseline.mjs",
  },
];

const forbiddenContent = [
  /nagjddldrldwavmfaytc/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:SUPABASE_SERVICE_ROLE_KEY|CLERK_SECRET_KEY)\s*=\s*\S+/,
];

const copied = [];
for (const file of files) {
  const source = resolve(root, file.source);
  const destination = resolve(target, file.destination);
  const content = readFileSync(source, "utf8");

  for (const pattern of forbiddenContent) {
    if (pattern.test(content)) {
      throw new Error(
        `Forbidden production reference or secret pattern found in ${file.source}.`
      );
    }
  }

  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  copied.push({
    path: file.destination.replaceAll("\\", "/"),
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  });
}

const migrations = readdirSync(join(target, "supabase", "migrations"));
if (
  migrations.length !== 1 ||
  migrations[0] !== "202607270000_reflab_canonical_baseline.sql"
) {
  throw new Error("Isolated validation chain must contain exactly the canonical baseline.");
}

process.stdout.write(
  `Prepared isolated baseline validation directory: ${target}\n` +
    `${JSON.stringify(
      {
        historical_migrations_copied: false,
        secrets_copied: false,
        files: copied,
      },
      null,
      2
    )}\n`
);
