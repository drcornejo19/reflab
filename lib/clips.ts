import type { SupabaseClient } from "@supabase/supabase-js";
import type { Clip, TrainingMode } from "@/lib/types";

export type ClipRecord = Clip & {
  sub_type?: string | null;
  decision_detail?: string | null;
  module?: string | null;
  type?: string | null;
  category?: string | null;
  training_type?: string | null;
  is_active?: boolean | null;
  updated_at?: string | null;
};

export type ClipDecisionPayload = {
  title: string;
  description?: string | null;
  video_url: string;
  topic: string;
  sub_type?: string | null;
  decision_detail?: string | null;
  difficulty: string;
  mode: TrainingMode;
  correct_foul?: boolean | null;
  correct_restart?: string | null;
  correct_discipline?: string | null;
  correct_var?: boolean | null;
  explanation?: string | null;
};

export type ClipValidationResult = {
  valid: boolean;
  messages: string[];
};

type SupabaseLike = SupabaseClient;
type ClipSaveError = { code?: string; message?: string; details?: string };

const englishTerms = [
  "english",
  "ingles",
  "english_referee",
  "modo ingles",
  "modo_ingles",
  "modulo ingles",
  "modulo_ingles",
  "ingles arbitral",
];

const noFoulRestarts = [
  "Seguir el juego",
  "Saque de meta",
  "Saque de esquina",
  "Saque de banda",
  "Gol",
  "Balon a tierra",
  "Balón a tierra",
];

const foulRestarts = ["Tiro libre directo", "Tiro libre indirecto", "Penal"];

export async function getClips(supabase: SupabaseLike) {
  return supabase.from("clips").select("*").order("created_at", { ascending: false });
}

export async function getTrainingClips(supabase: SupabaseLike, mode: "field" | "var" | "english") {
  const { data, error } = await getClips(supabase);

  if (error) return { data: null, error };

  const clips = ((data ?? []) as ClipRecord[]).filter((clip) => {
    if (clip.is_active === false) return false;

    if (mode === "var") {
      return clip.topic === "VAR" || clip.mode === "var";
    }

    if (mode === "english") {
      return isEnglishClip(clip);
    }

    return clip.topic !== "VAR" && clip.mode !== "var" && !isEnglishClip(clip);
  });

  return { data: clips, error: null };
}

export async function getExamClips(supabase: SupabaseLike) {
  const { data, error } = await getClips(supabase);

  if (error) return { data: null, error };

  const clips = ((data ?? []) as ClipRecord[]).filter(
    (clip) => clip.is_active !== false && !isEnglishClip(clip)
  );

  return { data: clips, error: null };
}

export async function getEnglishClips(supabase: SupabaseLike) {
  const { data, error } = await getClips(supabase);

  if (error) return { data: null, error };

  const clips = ((data ?? []) as ClipRecord[])
    .filter((clip) => clip.is_active !== false && isEnglishClip(clip))
    .sort(compareByCreatedAtAsc);

  return { data: clips, error: null };
}

export async function insertClipDecision(supabase: SupabaseLike, payload: ClipDecisionPayload) {
  const primary = stripUndefined(payload);
  const primaryResult = await supabase.from("clips").insert([primary]).select("*").maybeSingle();

  if (!primaryResult.error) {
    return {
      ...primaryResult,
      error: primaryResult.data
        ? null
        : {
            message:
              "No se pudo confirmar la creacion del clip. Revisa permisos de lectura de Admin en Supabase.",
          },
    };
  }

  return primaryResult;
}

export async function updateClipDecision(
  supabase: SupabaseLike,
  clipId: string,
  payload: ClipDecisionPayload
) {
  const primary = stripUndefined({
    ...payload,
    updated_at: new Date().toISOString(),
  });

  const primaryResult = await supabase
    .from("clips")
    .update(primary)
    .eq("id", clipId)
    .select("*")
    .maybeSingle();

  if (!primaryResult.error) {
    return {
      ...primaryResult,
      error: primaryResult.data
        ? null
        : {
            message:
              "No se actualizo ningun clip. Revisa permisos de administrador o que el clip exista en Supabase.",
          },
    };
  }

  if (!isSchemaCompatibilityError(primaryResult.error)) return primaryResult;

  const fallbackResult = await supabase
    .from("clips")
    .update(stripUndefined(payload))
    .eq("id", clipId)
    .select("*")
    .maybeSingle();

  return {
    ...fallbackResult,
    error:
      fallbackResult.error ??
      (fallbackResult.data
        ? null
        : {
            message:
              "No se actualizo ningun clip. Revisa permisos de administrador o que el clip exista en Supabase.",
          }),
  };
}

export async function deleteClipById(supabase: SupabaseLike, clipId: string) {
  return supabase.from("clips").delete().eq("id", clipId);
}

export function validateClipDecision(payload: ClipDecisionPayload): ClipValidationResult {
  if (payload.mode === "english") return { valid: true, messages: [] };

  const messages: string[] = [];
  const restart = payload.correct_restart ?? "";
  const discipline = payload.correct_discipline ?? "";
  const explanation = payload.explanation?.trim() ?? "";
  const isNoOffside = payload.topic === "Offside" && payload.sub_type === "no_offside";
  const isNoHandball = payload.topic === "Handball" && payload.sub_type === "no_sancionable";

  if ((isNoOffside || isNoHandball) && payload.correct_foul !== false) {
    messages.push("Si la jugada es 'no sancionable', la decision tecnica debe quedar como sin infraccion.");
  }

  if ((isNoOffside || isNoHandball) && restart !== "Seguir el juego") {
    messages.push("Si no hay infraccion, la reanudacion esperada debe ser 'Seguir el juego'.");
  }

  if (payload.correct_foul === false && foulRestarts.includes(restart)) {
    messages.push("Una jugada sin infraccion no deberia reanudarse con tiro libre o penal.");
  }

  if (payload.correct_foul === true && noFoulRestarts.includes(restart)) {
    messages.push("Una jugada con infraccion deberia tener una reanudacion sancionatoria.");
  }

  if (restart === "Penal" && payload.correct_foul !== true) {
    messages.push("Para indicar penal debe existir una infraccion sancionable.");
  }

  if ((discipline === "Amarilla" || discipline === "Roja") && explanation.length < 8) {
    messages.push("Si hay tarjeta, agrega una explicacion disciplinaria minima.");
  }

  return {
    valid: messages.length === 0,
    messages,
  };
}

export function normalizeClipDecision(payload: ClipDecisionPayload): ClipDecisionPayload {
  const isNoOffside = payload.topic === "Offside" && payload.sub_type === "no_offside";
  const isNoHandball = payload.topic === "Handball" && payload.sub_type === "no_sancionable";

  if (!isNoOffside && !isNoHandball) return payload;

  return {
    ...payload,
    correct_foul: false,
    correct_restart: "Seguir el juego",
    correct_discipline: "Sin tarjeta",
  };
}

export function isEnglishClip(clip: Partial<ClipRecord>) {
  const values = [
    clip.mode,
    clip.module,
    clip.type,
    clip.category,
    clip.training_type,
    clip.topic,
    clip.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return englishTerms.some((term) => values.includes(term));
}

function compareByCreatedAtAsc(a: ClipRecord, b: ClipRecord) {
  return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
}

function stripUndefined<T extends object>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function isSchemaCompatibilityError(error: ClipSaveError) {
  const message = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return (
    message.includes("pgrst204") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}
