import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const allowedTrackedEnvironmentFiles = new Set([".env.example"]);
const detectors = [
  {
    name: "JWT",
    pattern:
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9_.-]{20,}\b/gi,
  },
  {
    name: "Private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: "Session token JSON",
    pattern:
      /"(?:session_token|__session|access_token|refresh_token)"\s*:\s*"([^"]+)"/gi,
    validate: (match) => !isPlaceholder(match[1]),
  },
  {
    name: "Server secret assignment",
    pattern:
      /(?:^|\n)\s*(?:SUPABASE_SERVICE_ROLE_KEY|CLERK_SECRET_KEY)\s*=\s*([^\s#]+)/g,
    validate: (match) => !isPlaceholder(match[1]),
  },
];

const files = listCandidateFiles();
const findings = [];

for (const relativePath of files) {
  if (
    isEnvironmentFile(relativePath) &&
    !allowedTrackedEnvironmentFiles.has(normalizePath(relativePath))
  ) {
    findings.push({
      file: normalizePath(relativePath),
      detector: "Unauthorized environment file",
      line: 1,
    });
    continue;
  }

  const absolutePath = path.resolve(relativePath);
  let buffer;

  try {
    buffer = fs.readFileSync(absolutePath);
  } catch {
    continue;
  }

  if (buffer.includes(0)) continue;

  const content = buffer.toString("utf8");
  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of content.matchAll(detector.pattern)) {
      if (detector.validate && !detector.validate(match)) continue;

      findings.push({
        file: normalizePath(relativePath),
        detector: detector.name,
        line: lineNumberAt(content, match.index ?? 0),
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Potential sensitive values were found:");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.detector}]`
    );
  }
  console.error("Secret values are intentionally omitted.");
  process.exit(1);
}

console.log(
  `Secret scan passed for ${files.length} tracked and non-ignored files.`
);

function listCandidateFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "-c", "-o", "--exclude-standard"],
    { encoding: "utf8" }
  );

  return [...new Set(output.split("\0").filter(Boolean))];
}

function isEnvironmentFile(relativePath) {
  const fileName = path.basename(relativePath);
  return fileName === ".env" || fileName.startsWith(".env.");
}

function isPlaceholder(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return (
    normalized === "" ||
    normalized.includes("example") ||
    normalized.includes("placeholder") ||
    normalized.includes("your_") ||
    normalized.includes("tu_") ||
    (normalized.startsWith("<") && normalized.endsWith(">"))
  );
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function normalizePath(relativePath) {
  return relativePath.replaceAll("\\", "/");
}
