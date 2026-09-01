import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { resolveCoachTextVerbosity } from "./modelCompatibility.ts";

const root = process.cwd();

test("gpt-4o-mini uses its supported medium text verbosity", () => {
  assert.equal(resolveCoachTextVerbosity("gpt-4o-mini"), "medium");
});

test("the pinned gpt-4o-mini snapshot uses medium text verbosity", () => {
  assert.equal(
    resolveCoachTextVerbosity("gpt-4o-mini-2024-07-18"),
    "medium"
  );
});

test("an alternate Coach model does not inherit a possibly incompatible verbosity", () => {
  assert.equal(resolveCoachTextVerbosity("gpt-5-mini"), undefined);
  assert.equal(resolveCoachTextVerbosity("custom-provider-model"), undefined);
});

test("the Coach gateway applies the compatibility resolver without adding reasoning", () => {
  const gateway = fs.readFileSync(
    path.join(root, "lib/coach/gateway.ts"),
    "utf8"
  );

  assert.match(gateway, /resolveCoachTextVerbosity\(model\)/);
  assert.doesNotMatch(gateway, /verbosity:\s*["']low["']/);
  assert.doesNotMatch(gateway, /reasoning\s*:/);
});
