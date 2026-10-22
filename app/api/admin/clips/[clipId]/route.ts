import { NextResponse } from "next/server";
import { requireStrictSuperAdminAccess } from "@/lib/adminAuthorization";
import {
  deactivateAdminClip,
  getAdminClipPublicError,
  updateAdminClip,
} from "@/lib/admin/clips";

export const dynamic = "force-dynamic";

type ClipRouteContext = { params: Promise<{ clipId: string }> };

export async function PATCH(request: Request, context: ClipRouteContext) {
  const access = await requireStrictSuperAdminAccess();
  if (access.response) return access.response;

  try {
    const { clipId } = await context.params;
    const body = await readJson(request);
    const clip = await updateAdminClip(
      access.supabase,
      access.userId,
      clipId,
      body
    );
    return NextResponse.json({ clip });
  } catch (error) {
    return publicError(error);
  }
}

export async function DELETE(_request: Request, context: ClipRouteContext) {
  const access = await requireStrictSuperAdminAccess();
  if (access.response) return access.response;

  try {
    const { clipId } = await context.params;
    const clip = await deactivateAdminClip(
      access.supabase,
      access.userId,
      clipId
    );
    return NextResponse.json({ clip });
  } catch (error) {
    return publicError(error);
  }
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function publicError(error: unknown) {
  const result = getAdminClipPublicError(error);
  return NextResponse.json(result.body, { status: result.status });
}
