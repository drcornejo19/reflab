import "server-only";

import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  DEFAULT_SPORT_TYPE,
  type SportType,
} from "../sports.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import {
  buildCanonicalPerformanceSummary,
  type CanonicalPerformanceRecords,
} from "./canonicalSummaryModel.ts";

export type CanonicalPerformanceDependencies = {
  loadAccess(externalSubject: string): Promise<AccessSnapshot>;
  loadOfficialRecords(
    canonicalUserId: string,
    sportType: SportType
  ): Promise<CanonicalPerformanceRecords>;
};

type CanonicalPerformanceRouteDependencies = {
  getAuthenticatedUserId(): Promise<string | null>;
  loadSummary(externalSubject: string, sportType: SportType): Promise<unknown>;
  logError(label: string, diagnostic: { code: string; message: string }): void;
};

export async function executeCanonicalPerformanceSummaryRequest(
  request: Request,
  dependencies: CanonicalPerformanceRouteDependencies
) {
  const externalSubject = await dependencies.getAuthenticatedUserId();
  if (!externalSubject) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }

  const url = new URL(request.url);
  if (
    [...url.searchParams.keys()].some((key) => key !== "sportType")
  ) {
    return Response.json({ error: "invalid_query" }, { status: 400 });
  }
  const sportType = parseSportType(url.searchParams.get("sportType"));
  if (!sportType) {
    return Response.json({ error: "invalid_sport_type" }, { status: 400 });
  }

  try {
    const performance = await dependencies.loadSummary(
      externalSubject,
      sportType
    );
    return Response.json({ performance });
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return Response.json(
        { error: "identity_link_required" },
        { status: 409 }
      );
    }

    dependencies.logError(
      "Canonical performance summary failed",
      sanitizeDiagnostic(error)
    );
    return Response.json(
      {
        error: "performance_unavailable",
        message: "No se pudo cargar el rendimiento oficial.",
      },
      { status: 500 }
    );
  }
}

export async function loadCanonicalPerformanceSummary(
  externalSubject: string,
  sportType: SportType,
  dependencies = createCanonicalPerformanceDependencies()
) {
  const access = await dependencies.loadAccess(externalSubject);
  const records = await dependencies.loadOfficialRecords(
    access.userId,
    sportType
  );
  return buildCanonicalPerformanceSummary({
    ...records,
    sportType,
    canonicalUserId: access.userId,
  });
}

function createCanonicalPerformanceDependencies(): CanonicalPerformanceDependencies {
  const supabase = createSupabaseAdminClient();

  return {
    loadAccess: (externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, {
        provisionMissing: false,
      }),
    loadOfficialRecords: async (canonicalUserId, sportType) => {
      const [attemptsResult, examResultsResult] = await Promise.all([
        supabase
          .from("attempts")
          .select("*")
          .eq("user_id", canonicalUserId)
          .eq("sport_type", sportType)
          .not("exam_result_id", "is", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("exam_results")
          .select(
            "id,user_id,exam_session_id,submission_id,payload_hash,sport_type,activity_type,total_questions,total_score,avg_score,correct_count,details,submitted_at,created_at"
          )
          .eq("user_id", canonicalUserId)
          .eq("sport_type", sportType)
          .order("submitted_at", { ascending: false }),
      ]);

      if (attemptsResult.error) throw attemptsResult.error;
      if (examResultsResult.error) throw examResultsResult.error;

      return {
        attempts: attemptsResult.data ?? [],
        examResults: examResultsResult.data ?? [],
      };
    },
  };
}

function parseSportType(value: string | null): SportType | null {
  if (!value) return DEFAULT_SPORT_TYPE;
  if (value === "football_11" || value === "futsal") return value;
  return null;
}

function sanitizeDiagnostic(error: unknown) {
  if (error instanceof Error) {
    return { code: "unexpected_error", message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code:
        typeof record.code === "string" ? record.code : "unexpected_error",
      message:
        typeof record.message === "string"
          ? record.message
          : "Unknown performance error",
    };
  }
  return { code: "unexpected_error", message: String(error) };
}
