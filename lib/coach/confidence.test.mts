import assert from "node:assert/strict";
import test from "node:test";
import { calculateCoachConfidence } from "./confidence.ts";
import type { CoachEvidenceReference } from "./types.ts";

const completeEvidence: CoachEvidenceReference = {
  id: "clip:1",
  evidenceType: "clip",
  sourceTable: "clips",
  sourceId: "1",
  title: "Caso reglamentario",
  authority: "IFAB",
  sportType: "football_11",
  ruleReference: "Law 12",
  sourceVersion: "2026/27",
  officialUrl: "https://www.theifab.com/",
  isOfficial: true,
  normativeStatus: "current",
  reviewedAt: "2026-07-20T00:00:00.000Z",
};

test("requires human review when there is no evidence", () => {
  const result = calculateCoachConfidence({ evidence: [] });

  assert.equal(result.label, "human_review");
  assert.equal(result.requiresHumanReview, true);
});

test("returns high confidence only for complete official evidence", () => {
  const result = calculateCoachConfidence({
    evidence: [completeEvidence],
    sampleSize: 1,
    minimumSampleSize: 1,
  });

  assert.equal(result.label, "high");
  assert.equal(result.score, 92);
  assert.equal(result.requiresHumanReview, false);
});

test("returns medium confidence when official evidence is incomplete", () => {
  const result = calculateCoachConfidence({
    evidence: [{ ...completeEvidence, reviewedAt: null }],
  });

  assert.equal(result.label, "medium");
  assert.equal(result.requiresHumanReview, false);
  assert.ok(result.reasons.some((reason) => reason.includes("fecha de revision")));
});

test("requires review when the sample is smaller than the agreed minimum", () => {
  const result = calculateCoachConfidence({
    evidence: [completeEvidence],
    sampleSize: 1,
    minimumSampleSize: 5,
  });

  assert.equal(result.label, "human_review");
  assert.equal(result.requiresHumanReview, true);
});
