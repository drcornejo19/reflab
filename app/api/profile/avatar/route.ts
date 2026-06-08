import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  ensureUserRecords,
  toClientProfile,
  upsertUserProfile,
} from "@/lib/reflabUserRecords";

export const dynamic = "force-dynamic";

const maxAvatarBytes = 5 * 1024 * 1024;
const allowedAvatarTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const access = await getAvatarAccess();
  if (access.response) return access.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Imagen invalida." }, { status: 400 });
  }

  const avatar = formData.get("avatar");
  if (!(avatar instanceof File)) {
    return NextResponse.json({ error: "Falta la imagen recortada." }, { status: 400 });
  }

  if (!allowedAvatarTypes.has(avatar.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa PNG, JPG o WebP." },
      { status: 400 }
    );
  }

  if (avatar.size > maxAvatarBytes) {
    return NextResponse.json(
      { error: "La imagen supera el limite de 5 MB." },
      { status: 400 }
    );
  }

  try {
    const ensured = await ensureUserRecords(access.supabase, access.clerkUser);
    const filePath = `${access.clerkUser.id}/profile.png`;
    const { error: uploadError } = await access.supabase.storage
      .from("avatars")
      .upload(filePath, avatar, {
        cacheControl: "3600",
        contentType: avatar.type || "image/png",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        {
          error: "No se pudo subir la foto.",
          technical: uploadError.message,
        },
        { status: 500 }
      );
    }

    const { data } = access.supabase.storage.from("avatars").getPublicUrl(filePath);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const profileResult = await upsertUserProfile(access.supabase, {
      user_id: access.clerkUser.id,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    });

    if (profileResult.error) {
      return NextResponse.json(
        {
          error: "La foto subio, pero no se pudo actualizar el perfil.",
          technical: profileResult.error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      avatarUrl,
      profile: toClientProfile(
        profileResult.data ?? ensured.profile,
        ensured.role,
        access.clerkUser
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo guardar la foto.",
        technical: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

async function getAvatarAccess() {
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
