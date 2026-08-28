import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFieldScore,
  calculateScore,
  FIELD_SCORING_VERSION,
} from "./scoring.ts";

const correctFieldAnswer = {
  foul: true,
  restart: "Tiro libre directo",
  discipline: "Amarilla",
};

test("field scoring normalizes only the three applicable technical criteria", () => {
  const correct = { ...correctFieldAnswer, var: null };

  assert.equal(calculateFieldScore(correctFieldAnswer, correct), 100);
  assert.equal(
    calculateFieldScore({ ...correctFieldAnswer, foul: false }, correct),
    53
  );
  assert.equal(
    calculateFieldScore({ ...correctFieldAnswer, restart: "Seguir el juego" }, correct),
    80
  );
  assert.equal(
    calculateFieldScore({ ...correctFieldAnswer, discipline: "Roja" }, correct),
    67
  );
});

test("VAR is excluded from field scoring without an explicit user answer", () => {
  for (const expectedVar of [null, true, false]) {
    assert.equal(
      calculateFieldScore(correctFieldAnswer, {
        ...correctFieldAnswer,
        var: expectedVar,
      }),
      100
    );
  }
});

test("an explicit applicable VAR answer retains its configured weight", () => {
  assert.equal(
    calculateScore(
      { ...correctFieldAnswer, var: true },
      { ...correctFieldAnswer, var: true }
    ),
    100
  );
  assert.equal(
    calculateScore(
      { ...correctFieldAnswer, var: false },
      { ...correctFieldAnswer, var: true }
    ),
    75
  );
  assert.equal(FIELD_SCORING_VERSION, "field_applicable_v2");
});
