import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createAvatarUploadResponse,
  sanitizeAvatarError,
  uploadCanonicalAvatar,
} from "@/lib/profile/avatarUpload";

export const dynamic = "force-dynamic";

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

  return createAvatarUploadResponse(() =>
    uploadCanonicalAvatar(
      access.supabase,
      access.clerkUser.id,
      access.clerkUser,
      avatar
    )
  );
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
    const diagnostic = sanitizeAvatarError(error);
    console.error("[profile.avatar.access]", diagnostic);
    return {
      response: NextResponse.json(
        {
          error: "No se pudo validar el usuario.",
          code: diagnostic.code,
        },
        { status: 500 }
      ),
      clerkUser: null as never,
      supabase: null as never,
    };
  }
}
