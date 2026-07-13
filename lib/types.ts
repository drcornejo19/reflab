import type { SportType } from "@/lib/sports";

export type TrainingMode =
  | "field"
  | "var"
  | "english"
  | "exam"
  | "training";

export type Clip = {
  id: string;
  sport_type?: SportType | null;
  subtopic?: string | null;
  rule_reference?: string | null;
  season?: string | null;
  source_version?: string | null;
  source_official?: string | null;
  governing_body?: string | null;
  technical_resolution?: string | null;
  disciplinary_resolution?: string | null;
  normative_status?: string | null;
  language?: string | null;
  reviewed_at?: string | null;
  analysis_answers?: Record<string, string | boolean | null> | null;

  title: string;
  description?: string | null;
  video_url: string;

  topic: string;
  difficulty: string;

  // 🔥 CLAVE (esto te estaba rompiendo todo)
  mode?: TrainingMode;

  // =========================
  // MODO ÁRBITRO (FIELD)
  // =========================
  correct_foul?: boolean | null;
  correct_restart?: string | null;
  correct_discipline?: string | null;
  correct_var?: boolean | null;

  // =========================
  // MODO VAR
  // =========================
  incident_type?: string | null;
  correct_clear_error?: "yes" | "no" | "unclear" | null;
  correct_app_status?: "same_app" | "new_app" | "not_relevant" | null;
  correct_var_decision?: "check_complete" | "recommend_ofr" | "factual_review" | null;

  // =========================
  explanation?: string | null;
  created_at?: string;
};
