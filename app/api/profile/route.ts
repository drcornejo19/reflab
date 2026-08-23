import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  createProfileGetResponse,
  createProfilePatchResponse,
  getProfilePayload,
  updateProfilePayload,
  type ProfilePatchInput,
} from "@/lib/profile/getProfile";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getProfileAccess();
  if (access.response) return access.response;

  return createProfileGetResponse(() =>
    getProfilePayload(
      access.supabase,
      access.clerkUser.id,
      access.clerkUser
    )
  );
}

export async function PATCH(request: Request) {
  const access = await getProfileAccess();
  if (access.response) return access.response;

  let body: ProfilePatchInput;
  try {
    body = (await request.json()) as ProfilePatchInput;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  return createProfilePatchResponse(() =>
    updateProfilePayload(
      access.supabase,
      access.clerkUser.id,
      access.clerkUser,
      body
    )
  );
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
