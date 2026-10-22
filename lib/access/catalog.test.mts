import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGlobalRole } from "./catalog.ts";
import { normalizeRole } from "../institutionalRoles.ts";

test("canonical global roles are recognized exactly", () => {
  assert.equal(normalizeGlobalRole("super_admin"), "super_admin");
  assert.equal(normalizeGlobalRole("referee"), "referee");
});

test("legacy and unknown global roles degrade without escalation", () => {
  for (const role of ["video_admin", "administrator", "", null, undefined]) {
    assert.equal(normalizeGlobalRole(role), "referee");
    assert.notEqual(normalizeRole(role), "super_admin");
  }
});

test("runtime contains no video_admin authorization alias", () => {
  const runtimeRoots = ["app", "components", "lib"];
  const runtimeSources = runtimeRoots.flatMap((root) => collectRuntimeSources(root));

  for (const source of runtimeSources) {
    const contents = fs.readFileSync(source, "utf8");
    assert.equal(contents.includes("video_admin"), false, source);
  }
});

function collectRuntimeSources(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) return collectRuntimeSources(candidate);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || entry.name.includes(".test.")) {
      return [];
    }
    return [candidate];
  });
}
