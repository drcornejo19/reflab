export type PublicRankingProfile = {
  user_id?: string | null;
  ref_card_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  ranking_display_name?: string | null;
  show_real_name_in_ranking?: boolean | null;
};

const DEFAULT_PUBLIC_URL = "https://reflab.app";

export function generateRefCardId(userId: string | null | undefined) {
  const source = userId || "anonymous";
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const numeric = Math.abs(hash >>> 0) % 1000000;
  return `RF-${new Date().getFullYear()}-${String(numeric).padStart(6, "0")}`;
}

export function resolveRefCardId(userId: string, profile?: PublicRankingProfile | null) {
  return profile?.ref_card_id?.trim() || generateRefCardId(userId);
}

export function getRefCardPublicUrl(refCardId: string) {
  const configured = process.env.NEXT_PUBLIC_REFLAB_PUBLIC_URL;
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const origin = (configured || browserOrigin || DEFAULT_PUBLIC_URL).replace(/\/$/, "");
  return `${origin}/refcard/${encodeURIComponent(refCardId)}`;
}

export function getPublicRankingName(
  userId: string,
  profile?: PublicRankingProfile | null,
  currentUserId?: string | null
) {
  if (currentUserId && userId === currentUserId) return "Tu posicion";

  const refCardId = resolveRefCardId(userId, profile);
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const displayName = profile?.ranking_display_name?.trim() || fullName;

  if (profile?.show_real_name_in_ranking && displayName) {
    return displayName;
  }

  return `Arbitro ${refCardId}`;
}
