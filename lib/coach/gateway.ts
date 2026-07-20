import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  CoachError,
  CoachProviderError,
  CoachSetupError,
} from "@/lib/coach/errors";
import type {
  CoachEvidence,
  CoachModelRequest,
  CoachModelResult,
} from "@/lib/coach/types";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const MODEL_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-mini";

export async function runCoachModel<T>(
  supabase: SupabaseAdminClient,
  request: CoachModelRequest<T>
): Promise<CoachModelResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CoachSetupError("Missing OPENAI_API_KEY.");
  }

  const runId = randomUUID();
  const model = process.env.REFLAB_COACH_MODEL?.trim() || DEFAULT_MODEL;
  const startedAt = Date.now();
  const inputDigest = digest(request.input);

  await insertRun(supabase, {
    id: runId,
    user_id: request.userId,
    institution_id: request.institutionId ?? null,
    sport_type: request.sportType,
    feature: request.feature,
    prompt_version: request.promptVersion,
    model_provider: MODEL_PROVIDER,
    model_name: model,
    status: "running",
    input_digest: inputDigest,
    evidence_count: request.evidence.length,
    confidence_label: request.confidence.label,
    confidence_score: request.confidence.score,
    requires_human_review: request.confidence.requiresHumanReview,
  });

  try {
    await insertEvidence(supabase, runId, request.evidence);

    const client = new OpenAI({
      apiKey,
      maxRetries: 1,
      timeout: 30_000,
    });
    const response = await client.responses.create({
      model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: request.maxOutputTokens ?? 900,
      metadata: {
        run_id: runId,
        feature: request.feature,
        prompt_version: request.promptVersion,
        sport_type: request.sportType,
      },
      safety_identifier: digest(request.userId).slice(0, 64),
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: request.outputSchema.name,
          schema: request.outputSchema.schema,
          strict: true,
        },
        verbosity: "low",
      },
    });

    if (!response.output_text?.trim()) {
      throw new CoachProviderError("OpenAI returned an empty structured response.");
    }

    let rawValue: unknown;
    try {
      rawValue = JSON.parse(response.output_text);
    } catch {
      throw new CoachProviderError("OpenAI returned malformed structured output.");
    }

    const value = request.outputSchema.parse(rawValue);
    const outputDigest = digest(JSON.stringify(value));
    const usage = response.usage;
    const completedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("coach_runs")
      .update({
        status: "completed",
        provider_response_id: response.id,
        input_tokens: usage?.input_tokens ?? null,
        output_tokens: usage?.output_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        output_digest: outputDigest,
        latency_ms: Date.now() - startedAt,
        completed_at: completedAt,
      })
      .eq("id", runId);

    if (updateError) {
      throw new CoachSetupError(`Coach audit update failed: ${updateError.message}`);
    }

    const { error: usageError } = await supabase.from("ai_usage_ledger").insert({
      run_id: runId,
      user_id: request.userId,
      feature: request.feature,
      model_provider: MODEL_PROVIDER,
      model_name: model,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
      total_tokens: usage?.total_tokens ?? 0,
      estimated_cost_usd: null,
    });

    if (usageError) {
      console.error("REFLAB_COACH_USAGE_LEDGER_ERROR", {
        runId,
        message: usageError.message,
      });
    }

    return {
      runId,
      value,
      confidence: request.confidence,
      evidence: request.evidence.map((item) => item.reference),
      model,
      promptVersion: request.promptVersion,
    };
  } catch (error) {
    await markRunFailed(supabase, runId, error, Date.now() - startedAt);
    if (error instanceof CoachError) throw error;
    throw new CoachProviderError(
      error instanceof Error ? error.message : "Unknown model provider error."
    );
  }
}

async function insertRun(
  supabase: SupabaseAdminClient,
  payload: Record<string, unknown>
) {
  const { error } = await supabase.from("coach_runs").insert(payload);
  if (error) {
    throw new CoachSetupError(`Coach audit schema unavailable: ${error.message}`);
  }
}

async function insertEvidence(
  supabase: SupabaseAdminClient,
  runId: string,
  evidence: CoachEvidence[]
) {
  if (evidence.length === 0) return;

  const rows = evidence.map((item) => ({
    run_id: runId,
    evidence_type: item.reference.evidenceType,
    source_table: item.reference.sourceTable,
    source_id: item.reference.sourceId,
    title: item.reference.title,
    authority: item.reference.authority,
    sport_type: item.reference.sportType,
    rule_reference: item.reference.ruleReference,
    source_version: item.reference.sourceVersion,
    official_url: item.reference.officialUrl,
    is_official: item.reference.isOfficial,
    normative_status: item.reference.normativeStatus,
    reviewed_at: item.reference.reviewedAt,
    evidence_snapshot: item.facts,
  }));
  const { error } = await supabase.from("coach_evidence").insert(rows);

  if (error) {
    throw new CoachSetupError(`Coach evidence audit failed: ${error.message}`);
  }
}

async function markRunFailed(
  supabase: SupabaseAdminClient,
  runId: string,
  error: unknown,
  latencyMs: number
) {
  const code = error instanceof CoachError ? error.code : "MODEL_UNAVAILABLE";
  const { error: updateError } = await supabase
    .from("coach_runs")
    .update({
      status: "failed",
      error_code: code,
      latency_ms: latencyMs,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  if (updateError) {
    console.error("REFLAB_COACH_RUN_FAILURE_AUDIT_ERROR", {
      runId,
      message: updateError.message,
    });
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
