import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  createFieldAiFeedbackRequest,
  FIELD_AI_FEEDBACK_UNAVAILABLE,
  isSameFieldFeedbackContext,
  isSameFieldFeedbackRequest,
  type FieldFeedbackPayload,
} from "./fieldFeedbackClient.ts";

const root = process.cwd();
const payload: FieldFeedbackPayload = {
  clipId: "d3f00000-0000-4000-8000-000000000001",
  sportType: "football_11",
  userAnswer: {
    foul: true,
    restart: "Tiro libre directo",
    discipline: "Amarilla",
  },
  justification: "Decision tecnica",
  feedbackLanguage: "es",
};

test("field persistence presents the canonical result before detached AI feedback", () => {
  const source = fs.readFileSync(
    path.join(root, "components/ClipExercise.tsx"),
    "utf8"
  );
  const submitBlock = source.slice(
    source.indexOf("async function submit()"),
    source.indexOf("function startAiFeedback")
  );

  assert.ok(submitBlock.indexOf("setResult(presentation)") >= 0);
  assert.ok(
    submitBlock.indexOf("setResult(presentation)") <
      submitBlock.indexOf("startAiFeedback(persistedPresentation.result.attemptId")
  );
  assert.match(submitBlock, /finally\s*\{[\s\S]*setIsSaving\(false\)/);
  assert.doesNotMatch(submitBlock, /await\s+startAiFeedback/);
  assert.match(source, /void request\.promise/);
  assert.match(source, /result !== null[\s\S]*\{result\.score\}/);
  assert.match(source, /loadingAi \?[\s\S]*Generando análisis/);
});

test("a slow AI request stays pending independently of the canonical result", async () => {
  let resolveResponse!: (response: Response) => void;
  const request = createFieldAiFeedbackRequest(payload, {
    timeoutMs: 1_000,
    fetchImpl: async () =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
  });
  let settled = false;
  void request.promise.finally(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  resolveResponse(Response.json({ feedback: "Analisis listo" }));
  assert.deepEqual(await request.promise, {
    status: "available",
    feedback: "Analisis listo",
  });
});

test("AI HTTP and network failures return unavailable without touching persistence", async () => {
  const httpFailure = createFieldAiFeedbackRequest(payload, {
    fetchImpl: async () => Response.json({ error: "failed" }, { status: 500 }),
  });
  assert.deepEqual(await httpFailure.promise, {
    status: "unavailable",
    feedback: FIELD_AI_FEEDBACK_UNAVAILABLE,
    reason: "http_error",
  });

  const networkFailure = createFieldAiFeedbackRequest(payload, {
    fetchImpl: async () => {
      throw new Error("network failure");
    },
  });
  assert.deepEqual(await networkFailure.promise, {
    status: "unavailable",
    feedback: FIELD_AI_FEEDBACK_UNAVAILABLE,
    reason: "network_error",
  });
});

test("AI timeout aborts only feedback and returns unavailable", async () => {
  const request = createFieldAiFeedbackRequest(payload, {
    timeoutMs: 5,
    fetchImpl: async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
  });

  assert.deepEqual(await request.promise, {
    status: "unavailable",
    feedback: FIELD_AI_FEEDBACK_UNAVAILABLE,
    reason: "timeout",
  });
});

test("old AI identities are rejected after retry, clip change, or topic change", () => {
  const active = {
    attemptId: "attempt-a",
    clipId: "clip-a",
    topic: "Dispute",
  };

  assert.equal(isSameFieldFeedbackRequest(active, { ...active }), true);
  assert.equal(
    isSameFieldFeedbackRequest(active, { ...active, attemptId: "attempt-b" }),
    false
  );
  assert.equal(
    isSameFieldFeedbackContext(active, { ...active, clipId: "clip-b" }),
    false
  );
  assert.equal(
    isSameFieldFeedbackContext(active, { ...active, topic: "Penalty" }),
    false
  );
});

test("field submit uses a synchronous ref guard against double persistence", () => {
  const source = fs.readFileSync(
    path.join(root, "components/ClipExercise.tsx"),
    "utf8"
  );

  assert.match(source, /if \(!canSubmit \|\| isSaving \|\| savingAttemptRef\.current\) return/);
  assert.match(source, /savingAttemptRef\.current = true/);
  assert.match(
    source,
    /finally\s*\{\s*savingAttemptRef\.current = false;[\s\S]*setIsSaving\(false\)/
  );
});

test("stale feedback is aborted on reset and unmount", () => {
  const source = fs.readFileSync(
    path.join(root, "components/ClipExercise.tsx"),
    "utf8"
  );

  assert.match(source, /activeAiRequestRef\.current\?\.request\.abort\(\)/);
  assert.match(source, /function invalidateAiFeedback\(\)/);
  assert.match(source, /reset\(false\)/);
  assert.match(source, /\[typedClip\.id, typedClip\.topic\]/);
});
