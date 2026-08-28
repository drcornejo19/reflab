export const FIELD_AI_FEEDBACK_TIMEOUT_MS = 35_000;
export const FIELD_AI_FEEDBACK_UNAVAILABLE = "No se pudo generar el feedback IA.";
export const FIELD_AI_FEEDBACK_EMPTY = "Sin feedback IA disponible.";

export type FieldFeedbackContext = {
  clipId: string;
  topic: string;
};

export type FieldFeedbackRequestIdentity = FieldFeedbackContext & {
  attemptId: string;
};

export type FieldFeedbackPayload = {
  clipId: string;
  sportType: "football_11" | "futsal";
  userAnswer: {
    foul: boolean | null;
    restart: string;
    discipline: string;
  };
  justification: string;
  feedbackLanguage: string;
};

export type FieldAiFeedbackOutcome = {
  status: "available" | "unavailable";
  feedback: string;
  reason?: "http_error" | "network_error" | "timeout" | "aborted";
};

type FieldAiFeedbackOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export function createFieldAiFeedbackRequest(
  payload: FieldFeedbackPayload,
  options: FieldAiFeedbackOptions = {}
) {
  const controller = new AbortController();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? FIELD_AI_FEEDBACK_TIMEOUT_MS;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const promise: Promise<FieldAiFeedbackOutcome> = (async () => {
    try {
      const response = await fetchImpl("/api/ai-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        return unavailable("http_error");
      }

      const body = (await response.json()) as unknown;
      const feedback = readFeedback(body);

      return {
        status: "available",
        feedback: feedback ?? FIELD_AI_FEEDBACK_EMPTY,
      };
    } catch {
      return unavailable(
        timedOut ? "timeout" : controller.signal.aborted ? "aborted" : "network_error"
      );
    } finally {
      clearTimeout(timeout);
    }
  })();

  return {
    abort: () => controller.abort(),
    promise,
  };
}

export function isSameFieldFeedbackContext(
  left: FieldFeedbackContext,
  right: FieldFeedbackContext
) {
  return left.clipId === right.clipId && left.topic === right.topic;
}

export function isSameFieldFeedbackRequest(
  left: FieldFeedbackRequestIdentity,
  right: FieldFeedbackRequestIdentity
) {
  return (
    left.attemptId === right.attemptId &&
    isSameFieldFeedbackContext(left, right)
  );
}

function readFeedback(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const feedback = (value as Record<string, unknown>).feedback;
  return typeof feedback === "string" && feedback.trim() ? feedback : null;
}

function unavailable(reason: NonNullable<FieldAiFeedbackOutcome["reason"]>) {
  return {
    status: "unavailable" as const,
    feedback: FIELD_AI_FEEDBACK_UNAVAILABLE,
    reason,
  };
}
