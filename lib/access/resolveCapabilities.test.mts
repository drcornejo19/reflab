import assert from "node:assert/strict";
import test from "node:test";
import { resolveCapabilityKeys } from "./resolveCapabilities.ts";

const grants = [
  { planKey: "basic", capabilityKey: "profile" },
  { planKey: "pro", capabilityKey: "advanced_dashboard" },
  { planKey: "academy", capabilityKey: "advanced_dashboard" },
  { planKey: "academy", capabilityKey: "institution_management" },
];

test("Basic receives only its configured capabilities", () => {
  assert.deepEqual(
    resolveCapabilityKeys({
      individualPlan: "basic",
      institutionGrants: [],
      planCapabilities: grants,
      overrides: [],
    }),
    ["profile"]
  );
});

test("an active Academy membership inherits advanced individual access", () => {
  assert.deepEqual(
    resolveCapabilityKeys({
      individualPlan: "basic",
      institutionGrants: [
        { institutionId: "institution-1", planKey: "academy" },
      ],
      planCapabilities: grants,
      overrides: [],
    }),
    ["advanced_dashboard", "institution_management", "profile"]
  );
});

test("an institutional deny removes only that institutional source", () => {
  assert.deepEqual(
    resolveCapabilityKeys({
      individualPlan: "pro",
      institutionGrants: [
        { institutionId: "institution-1", planKey: "academy" },
      ],
      planCapabilities: grants,
      overrides: [
        {
          institutionId: "institution-1",
          capabilityKey: "advanced_dashboard",
          scopeType: "institution_user",
          effect: "deny",
        },
      ],
    }),
    ["advanced_dashboard", "institution_management", "profile"]
  );
});

test("an institutional deny removes an institution-only capability", () => {
  assert.deepEqual(
    resolveCapabilityKeys({
      individualPlan: "pro",
      institutionGrants: [
        { institutionId: "institution-1", planKey: "academy" },
      ],
      planCapabilities: grants,
      overrides: [
        {
          institutionId: "institution-1",
          capabilityKey: "institution_management",
          scopeType: "institution_user",
          effect: "deny",
        },
      ],
    }),
    ["advanced_dashboard", "profile"]
  );
});

test("a global deny overrides personal and institutional grants", () => {
  assert.deepEqual(
    resolveCapabilityKeys({
      individualPlan: "pro",
      institutionGrants: [
        { institutionId: "institution-1", planKey: "academy" },
      ],
      planCapabilities: grants,
      overrides: [
        {
          capabilityKey: "advanced_dashboard",
          scopeType: "global_user",
          effect: "deny",
        },
      ],
    }),
    ["institution_management", "profile"]
  );
});

test("expired overrides are ignored", () => {
  assert.deepEqual(
    resolveCapabilityKeys({
      individualPlan: "pro",
      institutionGrants: [],
      planCapabilities: grants,
      overrides: [
        {
          capabilityKey: "advanced_dashboard",
          scopeType: "global_user",
          effect: "deny",
          validUntil: "2026-01-01T00:00:00.000Z",
        },
      ],
      now: new Date("2026-07-24T00:00:00.000Z").getTime(),
    }),
    ["advanced_dashboard", "profile"]
  );
});
