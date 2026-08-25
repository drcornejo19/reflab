import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  AdminClipError,
  createAdminClip,
  deactivateAdminClip,
  parseAdminClipCreate,
  parseAdminClipFilters,
  parseAdminClipPatch,
  updateAdminClip,
} from "./clips.ts";
import {
  AdminUsersForbiddenError,
  authorizeCanonicalAdminUsersRead,
} from "./usersRead.ts";

const root = process.cwd();
const clipId = "d3f00000-0000-4000-8000-000000000003";

function read(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function clip(overrides: Record<string, unknown> = {}) {
  return {
    id: clipId,
    sport_type: "football_11",
    title: "Disputa sintetica",
    description: "Caso arbitral sintetico.",
    video_url: "https://example.test/development-fixtures/clip.mp4",
    topic: "Dispute",
    subtopic: null,
    sub_type: null,
    decision_detail: null,
    difficulty: "intermediate",
    mode: "field",
    correct_foul: false,
    correct_restart: "Seguir el juego",
    correct_discipline: "Sin tarjeta",
    correct_var: null,
    explanation: "Contacto permitido.",
    governing_body: "IFAB",
    normative_status: "vigente",
    language: "es",
    analysis_answers: null,
    is_active: true,
    status: "published",
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z",
    ...overrides,
  };
}
function body(overrides: Record<string, unknown> = {}) {
  const value: Record<string, unknown> = { ...clip() };
  delete value.id;
  delete value.created_at;
  delete value.updated_at;
  return { ...value, ...overrides };
}

function rejects(operation: () => unknown, status = 400) {
  assert.throws(
    operation,
    (error: unknown) => error instanceof AdminClipError && error.status === status
  );
}

test("canonical Super Admin authorization never provisions", async () => {
  let options: unknown;
  const result = await authorizeCanonicalAdminUsersRead({} as never, "clerk_subject", {
    async loadActorAccess(_client, subject, receivedOptions) {
      assert.equal(subject, "clerk_subject");
      options = receivedOptions;
      return { userId: "user_dev_super_admin", globalRole: "super_admin" } as never;
    },
  });
  assert.equal(result.userId, "user_dev_super_admin");
  assert.deepEqual(options, { provisionMissing: false });
});

test("non-Super Admin and video_admin are forbidden", async () => {
  for (const role of ["referee", "video_admin"]) {
    await assert.rejects(
      authorizeCanonicalAdminUsersRead({} as never, "clerk_subject", {
        async loadActorAccess() {
          return { userId: "user_dev_referee_a", globalRole: role } as never;
        },
      }),
      AdminUsersForbiddenError
    );
  }
});

test("unlinked Development identity remains identity_link_required", async () => {
  await assert.rejects(
    authorizeCanonicalAdminUsersRead({} as never, "unlinked", {
      async loadActorAccess() {
        throw new IdentityLinkRequiredError();
      },
    }),
    IdentityLinkRequiredError
  );
});

test("GET defaults include drafts and inactive clips", () => {
  assert.deepEqual(parseAdminClipFilters("http://localhost/api/admin/clips"), { limit: 200 });
});

test("GET validates every filter", () => {
  assert.deepEqual(
    parseAdminClipFilters("http://localhost/api/admin/clips?sport=futsal&status=draft&isActive=false&limit=20"),
    { sportType: "futsal", status: "draft", isActive: false, limit: 20 }
  );
  rejects(() => parseAdminClipFilters("http://localhost/api/admin/clips?unknown=true"));
});

test("valid POST payload is normalized", () => {
  const result = parseAdminClipCreate(body());
  assert.equal(result.video_url, "https://example.test/development-fixtures/clip.mp4");
  assert.equal(result.is_active, true);
});

test("invalid core clip fields are rejected server-side", () => {
  for (const patch of [
    { sport_type: "basketball" },
    { mode: "legacy" },
    { difficulty: "impossible" },
    { status: "deleted" },
    { video_url: "javascript:alert(1)" },
  ]) rejects(() => parseAdminClipCreate(body(patch)));
});

test("unknown identity and bypass fields are rejected", () => {
  rejects(() => parseAdminClipCreate(body({ user_id: "user_external" })));
  rejects(() => parseAdminClipCreate(body({ saveAnyway: true })));
  assert.doesNotMatch(read("app/admin-clips/page.tsx"), /Guardar de todos modos/);
});

test("Futsal requires its canonical answer contract", () => {
  rejects(() => parseAdminClipCreate(body({
    sport_type: "futsal",
    governing_body: "FIFA",
    topic: "Dispute",
    rule_reference: "Regla 12",
    source_version: "2026/27",
    technical_resolution: "Sin infraccion.",
    analysis_answers: {},
  })));
});

test("archived state always deactivates a clip", () => {
  assert.equal(parseAdminClipCreate(body({ status: "archived" })).is_active, false);
});

test("PATCH validates the complete merged row", () => {
  assert.equal(parseAdminClipPatch({ title: "  Actualizado  " }, clip() as never).title, "Actualizado");
  rejects(() => parseAdminClipPatch({ topic: "Unknown" }, clip() as never));
});

test("POST persists through the server and audits the canonical actor", async () => {
  const writes: Array<{ table: string; payload: unknown }> = [];
  const supabase = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          writes.push({ table, payload });
          if (table === "platform_audit_logs") return Promise.resolve({ error: null });
          return { select() { return { async single() { return { data: clip(), error: null }; } }; } };
        },
      };
    },
  };
  await createAdminClip(supabase as never, "user_dev_super_admin", body());
  assert.deepEqual(writes.map((item) => item.table), ["clips", "platform_audit_logs"]);
  assert.equal(
    (writes[1]?.payload as { actor_user_id?: string } | undefined)?.actor_user_id,
    "user_dev_super_admin"
  );
  assert.doesNotMatch(JSON.stringify(writes), /clerk_subject/);
});

test("PATCH writes one clip update and one audit event", async () => {
  const calls: string[] = [];
  const result = await updateAdminClip(
    mutationClient(calls, clip(), clip({ title: "Actualizado" })) as never,
    "user_dev_super_admin",
    clipId,
    { title: "Actualizado" }
  );
  assert.equal(result.title, "Actualizado");
  assert.deepEqual(calls, ["clips.select", "clips.update", "audit:clip.updated"]);
});

test("DELETE is logical deactivation, never physical deletion", async () => {
  const calls: string[] = [];
  const result = await deactivateAdminClip(
    mutationClient(calls, clip(), clip({ is_active: false, status: "archived" })) as never,
    "user_dev_super_admin",
    clipId
  );
  assert.equal(result.is_active, false);
  assert.deepEqual(calls, ["clips.select", "clips.update", "audit:clip.deactivated"]);
  assert.doesNotMatch(read("lib/admin/clips.ts"), /\.delete\s*\(/);
});

test("soft deletion cannot modify attempts or snapshots", () => {
  assert.doesNotMatch(
    read("lib/admin/clips.ts"),
    /\.from\("(?:attempts|exam_results|referee_exam_sessions)"\)/
  );
});

test("browser code has zero clips DML", () => {
  const page = read("app/admin-clips/page.tsx");
  assert.doesNotMatch(page, /useSupabase|\.from\(["']clips["']\)|insertClipDecision|updateClipDecision|deleteClipById/);
  assert.match(page, /fetch\("\/api\/admin\/clips"/);
  assert.doesNotMatch(read("lib/clips.ts"), /export async function (?:insert|update|delete)Clip/);
});

test("GET handler is strictly read-only", () => {
  const route = read("app/api/admin/clips/route.ts");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /listAdminClips/);
  assert.doesNotMatch(get, /createAdminClip|\.insert\(|\.update\(|\.delete\(/);
});

test("canonical RLS remains read-only for authenticated", () => {
  const baseline = read("supabase/migrations/202607270000_reflab_canonical_baseline.sql");
  assert.match(baseline, /create policy clips_authenticated_read[\s\S]*?for select[\s\S]*?is_active = true and status = 'published'/);
  assert.match(baseline, /grant select on table\s+public\.clips,/);
});

test("Admin Clips has no legacy authority or provisioning", () => {
  const source = [
    read("lib/admin/clips.ts"),
    read("app/api/admin/clips/route.ts"),
    read("app/api/admin/clips/[clipId]/route.ts"),
    read("app/admin-clips/page.tsx"),
  ].join("\n");
  assert.doesNotMatch(source, /user_roles|automatic_default|ensureUserRecords|video_admin|provisionMissing:\s*true/);
  assert.match(read("lib/admin/usersRead.ts"), /provisionMissing: false/);
});

test("Admin Clips auth bypass is exact and returns handler JSON", () => {
  const proxy = read("proxy.ts");
  const manifest = read("lib/auth/apiAuthBoundary.ts");
  assert.match(manifest, /selfAuthorized\("\/api\/admin\/clips"/);
  assert.match(manifest, /"\/api\/admin\/clips\/\[clipId\]"/);
  assert.match(manifest, /UUID_SEGMENT/);
  assert.match(proxy, /classifyApiAuthPath\(req\.nextUrl\.pathname\)/);
  assert.doesNotMatch(proxy, /\/api\/admin\/clips\(\.\*\)/);
  const authorization = read("lib/adminAuthorization.ts");
  assert.match(authorization, /error: "Unauthorized"[\s\S]*?status: 401/);
  assert.match(authorization, /error\.code[\s\S]*?status: 409/);
});

test("audit is append-only and server-side upload remains documented debt", () => {
  const baseline = read("supabase/migrations/202607270000_reflab_canonical_baseline.sql");
  assert.match(baseline, /Audit records are append-only[\s\S]*?public\.platform_audit_logs/);
  assert.match(read("docs/admin-clips-server-boundary.md"), /uploader server-side/i);
  assert.doesNotMatch(read("lib/admin/clips.ts"), /storage\.from|\.upload\(/);
});

function mutationClient(
  calls: string[],
  existing: Record<string, unknown>,
  updated: Record<string, unknown>
) {
  return {
    from(table: string) {
      if (table === "platform_audit_logs") {
        return { async insert(payload: { action: string }) {
          calls.push(`audit:${payload.action}`);
          return { error: null };
        } };
      }
      return {
        select() {
          calls.push("clips.select");
          return { eq() { return { async maybeSingle() { return { data: existing, error: null }; } }; } };
        },
        update() {
          calls.push("clips.update");
          return { eq() { return { select() { return { async single() { return { data: updated, error: null }; } }; } }; } };
        },
      };
    },
  };
}
