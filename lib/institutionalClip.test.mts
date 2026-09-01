import assert from "node:assert/strict";
import test from "node:test";
import { parseInstitutionalClipSportType } from "./institutionalClip.ts";

test("institutional clips reject an omitted discipline", () => {
  assert.deepEqual(parseInstitutionalClipSportType(undefined), {
    ok: false,
    error: "La disciplina del clip es obligatoria.",
  });
  assert.equal(parseInstitutionalClipSportType("").ok, false);
});

test("institutional clips accept football_11", () => {
  assert.deepEqual(parseInstitutionalClipSportType("football_11"), {
    ok: true,
    value: "football_11",
  });
});

test("institutional clips accept futsal", () => {
  assert.deepEqual(parseInstitutionalClipSportType("futsal"), {
    ok: true,
    value: "futsal",
  });
});

test("institutional clips reject unknown, differently cased, or padded values", () => {
  for (const value of ["football11", "FUTSAL", " futsal ", "beach_soccer"]) {
    assert.equal(parseInstitutionalClipSportType(value).ok, false);
  }
});
