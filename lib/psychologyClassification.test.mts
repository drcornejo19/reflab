import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePsychologyCheckinModule,
  resolvePsychologyExerciseModule,
  resolvePsychologyWellbeingModule,
} from "./psychologyClassification.ts";

test("check-in types resolve to their canonical module", () => {
  assert.deepEqual(resolvePsychologyCheckinModule("pre_match"), {
    ok: true,
    moduleSlug: "preparacion-mental-pre-partido",
  });
  assert.deepEqual(resolvePsychologyCheckinModule("post_match"), {
    ok: true,
    moduleSlug: "evaluacion-post-partido",
  });
  assert.deepEqual(resolvePsychologyCheckinModule("error_recovery"), {
    ok: true,
    moduleSlug: "gestion-error",
  });
});

test("a client module must match the check-in classification", () => {
  assert.equal(
    resolvePsychologyCheckinModule("pre_match", "gestion-error").ok,
    false
  );
  assert.equal(resolvePsychologyCheckinModule("unknown").ok, false);
});

test("exercise types resolve without a silent fallback", () => {
  assert.deepEqual(resolvePsychologyExerciseModule("focus_reset"), {
    ok: true,
    moduleSlug: "concentracion-foco",
  });
  assert.deepEqual(resolvePsychologyExerciseModule("pressure_scenario"), {
    ok: true,
    moduleSlug: "presion-competitiva",
  });
  assert.deepEqual(resolvePsychologyExerciseModule("self_talk"), {
    ok: true,
    moduleSlug: "confianza-arbitral",
  });
  assert.deepEqual(resolvePsychologyExerciseModule("team_prebrief"), {
    ok: true,
    moduleSlug: "preparacion-mental-pre-partido",
  });
  assert.equal(resolvePsychologyExerciseModule(undefined).ok, false);
});

test("weekly wellbeing has one explicit domain classification", () => {
  assert.deepEqual(resolvePsychologyWellbeingModule(), {
    ok: true,
    moduleSlug: "resiliencia",
  });
  assert.equal(
    resolvePsychologyWellbeingModule("concentracion-foco").ok,
    false
  );
});
