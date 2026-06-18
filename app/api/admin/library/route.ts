import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeRole } from "@/lib/institutionalRoles";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedCategories = new Set([
  "reglas",
  "circular",
  "resumen",
  "protocolo_var",
  "cambios_reglamentarios",
  "mundial",
  "material_consulta",
]);

const allowedStatuses = new Set([
  "vigente",
  "proxima_actualizacion",
  "archivado",
]);

export async function GET() {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  const { data, error } = await access.supabase
    .from("ifab_library_documents")
    .select(
      "id,title,category,language,source_official,effective_date,status,summary,file_url,storage_path,uploaded_by,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    return NextResponse.json(
      { error: "No se pudo cargar la biblioteca IFAB.", technical: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formulario invalido." }, { status: 400 });
  }

  const title = formString(formData, "title");
  const category = formString(formData, "category") || "material_consulta";
  const language = formString(formData, "language") || "es";
  const status = formString(formData, "status") || "vigente";
  const sourceOfficial = formString(formData, "source_official") || null;
  const effectiveDate = formString(formData, "effective_date") || null;
  const summary = formString(formData, "summary") || null;
  const fileValue = formData.get("file");
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

  if (title.length < 3) {
    return NextResponse.json(
      { error: "Completa un titulo para el documento." },
      { status: 400 }
    );
  }

  if (!allowedCategories.has(category)) {
    return NextResponse.json({ error: "Categoria invalida." }, { status: 400 });
  }

  if (!allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
  }

  let fileUrl: string | null = null;
  let storagePath: string | null = null;

  if (file) {
    const upload = await uploadDocument(access.supabase, file, category);
    if ("error" in upload) {
      return NextResponse.json(upload, { status: 500 });
    }
    fileUrl = upload.fileUrl;
    storagePath = upload.storagePath;
  }

  const { data, error } = await access.supabase
    .from("ifab_library_documents")
    .insert({
      title,
      category,
      language,
      source_official: sourceOfficial,
      effective_date: effectiveDate,
      status,
      summary,
      file_url: fileUrl,
      storage_path: storagePath,
      uploaded_by: access.userId,
    })
    .select(
      "id,title,category,language,source_official,effective_date,status,summary,file_url,storage_path,uploaded_by,created_at,updated_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudo guardar el documento IFAB.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, document: data });
}

async function requireSuperAdmin() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
      userId: "",
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = normalizeRole(data?.role);
  if (error || role !== "super_admin") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
      userId,
    };
  }

  return { response: null, supabase, userId };
}

async function uploadDocument(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  file: File,
  category: string
) {
  const bucket = "ifab-library";
  const bucketResult = await supabase.storage.getBucket(bucket);

  if (bucketResult.error) {
    const createResult = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: "25MB",
      allowedMimeTypes: ["application/pdf"],
    });

    if (createResult.error && !createResult.error.message.toLowerCase().includes("already exists")) {
      return {
        error: "No se pudo preparar el bucket de Biblioteca IFAB.",
        technical: createResult.error.message,
      };
    }
  }

  const safeName = sanitizeFileName(file.name || "documento-ifab.pdf");
  const storagePath = `${category}/${Date.now()}-${safeName}`;
  const body = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
    contentType: file.type || "application/pdf",
    upsert: true,
  });

  if (error) {
    return {
      error: "No se pudo subir el PDF a Supabase Storage.",
      technical: error.message,
    };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);

  return {
    fileUrl: data.publicUrl,
    storagePath,
  };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned.toLowerCase()
    : `${cleaned.toLowerCase() || "documento-ifab"}.pdf`;
}
