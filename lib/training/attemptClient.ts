export type TrainingAttemptInput =
  | {
      kind: "field_clip";
      submissionId: string;
      clipId: string;
      answer: { foul: boolean; restart: string; discipline: string };
      timeSpentSeconds?: number;
    }
  | {
      kind: "var_clip";
      submissionId: string;
      clipId: string;
      answer: {
        selectedIncident: string;
        appStatus: string;
        clearError: string;
        varDecision: string;
        finalDecision?: string;
        communication?: string;
      };
      timeSpentSeconds?: number;
    }
  | {
      kind: "futsal_video";
      submissionId: string;
      clipId: string;
      answers: Record<string, string | boolean | null>;
      justification?: string;
      timeSpentSeconds?: number;
    }
  | {
      kind: "futsal_rule";
      submissionId: string;
      questionId: string;
      selectedOption: number;
    }
  | {
      kind: "physical";
      submissionId: string;
      preset: string;
      preparation: number;
      work: number;
      rest: number;
      sets: number;
    }
  | {
      kind: "ifab_trivia";
      submissionId: string;
      itemId: string;
      selectedAnswer: string;
    };

export type TrainingAttemptResult = {
  status: "created" | "already_recorded";
  attemptId: string;
  score: number | null;
  weeklyUsed: number | null;
};

export async function submitTrainingAttempt(input: TrainingAttemptInput) {
  const response = await fetch("/api/training/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as {
    result?: TrainingAttemptResult;
    error?: string;
  };

  if (!response.ok || !payload.result) {
    throw new Error(payload.error ?? "No se pudo guardar el intento.");
  }

  return payload.result;
}

export async function loadTrainingUsage(sportType: "football_11" | "futsal") {
  const response = await fetch(
    `/api/training/usage?sportType=${encodeURIComponent(sportType)}`,
    { method: "GET" }
  );
  const payload = (await response.json()) as {
    usage?: { weeklyUsed: number; weeklyLimit: number | null };
    error?: string;
  };

  if (!response.ok || !payload.usage) {
    throw new Error(payload.error ?? "No se pudo consultar el uso semanal.");
  }

  return payload.usage;
}

export function createTrainingSubmissionId() {
  return globalThis.crypto.randomUUID();
}
