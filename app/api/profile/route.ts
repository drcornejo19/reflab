import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  ensureUserRecords,
  getClerkPrimaryEmail,
  toClientProfile,
  upsertUserProfile,
} from "@/lib/reflabUserRecords";
import { resolveRefCardId } from "@/lib/refCard";
import { normalizeSubscriptionPlan } from "@/lib/subscription";
import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "@/lib/access/server";
import { toLegacyPlan } from "@/lib/access/catalog";

export const dynamic = "force-dynamic";

type ProfilePatchBody = {
  reflabName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  country?: unknown;
  city?: unknown;
  association?: unknown;
  refereeType?: unknown;
  mainRole?: unknown;
  category?: unknown;
  level?: unknown;
  birthDate?: unknown;
  publicProfile?: unknown;
  hideRankingName?: unknown;
  showRealNameInRanking?: unknown;
};

export async function GET() {
  const access = await getProfileAccess();
  if (access.response) return access.response;

  try {
    const accessSnapshot = await loadAccessSnapshot(
      access.supabase,
      access.clerkUser.id
    );
    const { clientProfile } = await ensureUserRecords(
      access.supabase,
      accessSnapshot.userId,
      access.clerkUser
    );

    return NextResponse.json({
      profile: {
        ...clientProfile,
        role:
          accessSnapshot.globalRole === "super_admin"
            ? "super_admin"
            : "individual_referee",
        subscriptionPlan: toLegacyPlan(
          accessSnapshot.effectiveIndividualPlan
        ),
      },
      access: accessSnapshot,
    });
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return NextResponse.json(
        { error: error.code },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "No se pudo cargar el perfil.",
        technical: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const access = await getProfileAccess();
  if (access.response) return access.response;

  let body: ProfilePatchBody;
  try {
    body = (await request.json()) as ProfilePatchBody;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const accessSnapshot = await loadAccessSnapshot(
      access.supabase,
      access.clerkUser.id
    );
    const ensured = await ensureUserRecords(
      access.supabase,
      accessSnapshot.userId,
      access.clerkUser
    );
    const existingProfile = ensured.profile;
    const existingRole = ensured.role;
    const now = new Date().toISOString();
    const email = getClerkPrimaryEmail(access.clerkUser);
    const firstName = cleanText(body.firstName);
    const lastName = cleanText(body.lastName);
    const reflabName = cleanText(body.reflabName);
    const mainRole = cleanText(body.mainRole) || "Arbitro principal";
    const showRealNameInRanking = Boolean(body.showRealNameInRanking);
    const hideRankingName =
      typeof body.hideRankingName === "boolean"
        ? body.hideRankingName
        : !showRealNameInRanking;
    const rankingDisplayName =
      reflabName || [firstName, lastName].filter(Boolean).join(" ").trim() || null;
    const subscriptionPlan = normalizeSubscriptionPlan(
      toLegacyPlan(accessSnapshot.individualPlan)
    );

    const profileResult = await upsertUserProfile(access.supabase, {
      user_id: accessSnapshot.userId,
      email,
      reflab_name: reflabName || null,
      first_name: firstName || null,
      last_name: lastName || null,
      country: cleanText(body.country) || null,
      city: cleanText(body.city) || null,
      association: cleanText(body.association) || null,
      referee_type: cleanText(body.refereeType) || "Amateur",
      main_role: mainRole,
      referee_role: mainRole,
      category: cleanText(body.category) || null,
      level: cleanText(body.level) || null,
      birth_date: cleanDate(body.birthDate),
      avatar_url: existingProfile?.avatar_url ?? access.clerkUser.imageUrl ?? null,
      ref_card_id: resolveRefCardId(accessSnapshot.userId, existingProfile),
      ranking_display_name: rankingDisplayName,
      show_real_name_in_ranking: showRealNameInRanking,
      public_profile: body.publicProfile !== false,
      hide_ranking_name: hideRankingName,
      subscription_plan: subscriptionPlan,
      updated_at: now,
    });

    if (profileResult.error) {
      return NextResponse.json(
        {
          error: "No se pudo guardar el perfil.",
          technical: profileResult.error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        ...toClientProfile(
          profileResult.data,
          existingRole,
          access.clerkUser
        ),
        role:
          accessSnapshot.globalRole === "super_admin"
            ? "super_admin"
            : "individual_referee",
        subscriptionPlan: toLegacyPlan(
          accessSnapshot.effectiveIndividualPlan
        ),
      },
      access: accessSnapshot,
    });
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return NextResponse.json(
        { error: error.code },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "No se pudo guardar el perfil.",
        technical: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

async function getProfileAccess() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      clerkUser: null as never,
      supabase: null as never,
    };
  }

  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const supabase = createSupabaseAdminClient();

    return { response: null, clerkUser, supabase };
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          error: "No se pudo validar el usuario.",
          technical: getErrorMessage(error),
        },
        { status: 500 }
      ),
      clerkUser: null as never,
      supabase: null as never,
    };
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = new Date(`${normalized}T00:00:00.000Z`).getTime();
  return Number.isFinite(parsed) ? normalized : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
