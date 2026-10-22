import { NextResponse } from "next/server";
import { requireStrictSuperAdminAccess } from "@/lib/adminAuthorization";
import {
  createAdminClip,
  getAdminClipPublicError,
  listAdminClips,
  parseAdminClipFilters,
} from "@/lib/admin/clips";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireStrictSuperAdminAccess();
  if (access.response) return access.response;

  try {
    const filters = parseAdminClipFilters(request.url);
    const clips = await listAdminClips(access.supabase, filters);
    return NextResponse.json({ clips });
  } catch (error) {
    return publicError(error);
  }
}

export async function POST(request: Request) {
  const access = await requireStrictSuperAdminAccess();
  if (access.response) return access.response;

  try {
    const body = await readJson(request);
    const clip = await createAdminClip(access.supabase, access.userId, body);
    return NextResponse.json({ clip }, { status: 201 });
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
