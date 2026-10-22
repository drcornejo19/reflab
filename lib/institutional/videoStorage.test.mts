import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  INSTITUTIONAL_VIDEO_BUCKET,
  InstitutionalVideoStorageError,
  MAXIMUM_INSTITUTIONAL_VIDEO_SIZE,
  uploadInstitutionalVideoWithCompensation,
} from "./videoStorage.ts";
import {
  InstitutionTenantAccessError,
  requireAuthorizedInstitutionContext,
} from "./tenantIsolation.ts";
import type {
  InstitutionAccessSnapshot,
  InstitutionContext,
} from "./types.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const institutionA = "11111111-1111-4111-8111-111111111111";
const institutionB = "22222222-2222-4222-8222-222222222222";
const objectId = "33333333-3333-4333-8333-333333333333";
const canonicalUserId = "user_dev_referee_a";

async function read(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

function mp4Bytes() {
  return Uint8Array.from([
    0x00, 0x00, 0x00, 0x0c,
    0x66, 0x74, 0x79, 0x70,
    0x69, 0x73, 0x6f, 0x6d,
  ]);
}

function videoFile(overrides: Partial<{
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}> = {}) {
  const bytes = overrides.bytes ?? mp4Bytes();
  return {
    name: overrides.name ?? "fixture.mp4",
    type: overrides.type ?? "video/mp4",
    size: overrides.size ?? bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
    },
  };
}

function storageHarness(options: { uploadError?: boolean; cleanupError?: boolean } = {}) {
  const calls: Array<{ operation: string; bucket?: string; path?: string; upsert?: boolean }> = [];
  return {
    calls,
    storage: {
      from(bucket: string) {
        calls.push({ operation: "from", bucket });
        return {
          async upload(path: string, _body: Uint8Array, uploadOptions: { upsert: false }) {
            calls.push({ operation: "upload", path, upsert: uploadOptions.upsert });
            return { error: options.uploadError ? { message: "synthetic" } : null };
          },
          async remove(paths: string[]) {
            calls.push({ operation: "remove", path: paths[0] });
            return { error: options.cleanupError ? { message: "synthetic" } : null };
          },
        };
      },
    },
  };
}

test("institutional videos use only the canonical private bucket", async () => {
  assert.equal(INSTITUTIONAL_VIDEO_BUCKET, "institutional-content");
  const baseline = await read(
    "supabase/migrations/202607270000_reflab_canonical_baseline.sql"
  );
  assert.match(
    baseline,
    /'institutional-content',[\s\S]*?false,[\s\S]*?104857600/
  );
  assert.match(
    baseline,
    /institutional_content_authenticated_read[\s\S]*?bucket_id = 'institutional-content'/
  );
});

test("upload path is server-derived, canonical and non-overwriting", async () => {
  const harness = storageHarness();
  let persisted: unknown;
  const result = await uploadInstitutionalVideoWithCompensation({
    storage: harness.storage,
    institutionId: institutionA,
    canonicalUserId,
    objectId,
    file: videoFile({ name: "..\\unsafe\\original.MP4" }),
    async persist(upload) {
      persisted = upload;
      return "created";
    },
  });

  const expectedPath = `${institutionA}/${canonicalUserId}/videos/${objectId}.mp4`;
  assert.equal(result, "created");
  assert.deepEqual(harness.calls, [
    { operation: "from", bucket: "institutional-content" },
    { operation: "upload", path: expectedPath, upsert: false },
  ]);
  assert.deepEqual(persisted, {
    storagePath: expectedPath,
    originalFilename: "original.MP4",
    mimeType: "video/mp4",
    size: 12,
  });
});

test("invalid MIME and mismatched video content are rejected before upload", async () => {
  for (const file of [
    videoFile({ type: "application/octet-stream" }),
    videoFile({ bytes: Uint8Array.from({ length: 12 }, () => 0) }),
  ]) {
    const harness = storageHarness();
    await assert.rejects(
      uploadInstitutionalVideoWithCompensation({
        storage: harness.storage,
        institutionId: institutionA,
        canonicalUserId,
        objectId,
        file,
        async persist() {
          return null;
        },
      }),
      (error: unknown) =>
        error instanceof InstitutionalVideoStorageError && error.status === 400
    );
    assert.deepEqual(harness.calls, []);
  }
});

test("oversized videos are rejected before reading bytes or contacting Storage", async () => {
  const harness = storageHarness();
  let bytesRead = false;
  await assert.rejects(
    uploadInstitutionalVideoWithCompensation({
      storage: harness.storage,
      institutionId: institutionA,
      canonicalUserId,
      objectId,
      file: {
        name: "large.mp4",
        type: "video/mp4",
        size: MAXIMUM_INSTITUTIONAL_VIDEO_SIZE + 1,
        async arrayBuffer() {
          bytesRead = true;
          return new ArrayBuffer(0);
        },
      },
      async persist() {
        return null;
      },
    }),
    (error: unknown) =>
      error instanceof InstitutionalVideoStorageError && error.status === 400
  );
  assert.equal(bytesRead, false);
  assert.deepEqual(harness.calls, []);
});

test("a database failure after upload removes exactly the new object", async () => {
  const harness = storageHarness();
  const expectedPath = `${institutionA}/${canonicalUserId}/videos/${objectId}.mp4`;
  await assert.rejects(
    uploadInstitutionalVideoWithCompensation({
      storage: harness.storage,
      institutionId: institutionA,
      canonicalUserId,
      objectId,
      file: videoFile(),
      async persist() {
        throw new Error("synthetic database failure");
      },
    }),
    /synthetic database failure/
  );
  assert.deepEqual(harness.calls, [
    { operation: "from", bucket: "institutional-content" },
    { operation: "upload", path: expectedPath, upsert: false },
    { operation: "remove", path: expectedPath },
  ]);
});

test("an unauthorized tenant cannot be substituted into the upload", async () => {
  const context = {
    institution: { id: institutionA },
    membership: { permissionKeys: ["content.manage"] },
    isSuperAdmin: false,
    simulatedRole: null,
    demoMode: false,
  } as InstitutionContext;
  const snapshot = {
    contexts: [context],
    activeInstitutionId: institutionA,
    isSuperAdmin: false,
  } as InstitutionAccessSnapshot;

  assert.throws(
    () => requireAuthorizedInstitutionContext(snapshot, institutionB),
    InstitutionTenantAccessError
  );
  assert.equal(
    requireAuthorizedInstitutionContext(snapshot, institutionA).institution.id,
    institutionA
  );
});

test("the route derives tenant, identity and storage path only after authorization", async () => {
  const route = await read("app/api/institution/videos/route.ts");
  assert.match(route, /requireInstitutionPermission\("content\.read"\)/);
  assert.match(route, /requireInstitutionPermission\("content\.manage"\)/);
  assert.match(route, /institutionId: access\.institutionId/);
  assert.match(route, /canonicalUserId: access\.userId/);
  assert.match(route, /institution_id: access\.institutionId/);
  assert.match(route, /uploaded_by: access\.userId/);
  assert.doesNotMatch(route, /storage_path:\s*(?:payload|body|form)/);
  assert.doesNotMatch(route, /user_roles|automatic_default|ensureUserRecords/);
});

test("institutional auth preserves JSON 401, 409 and 403 without provisioning", async () => {
  const [server, identity] = await Promise.all([
    read("lib/institutional/server.ts"),
    read("lib/institutional/institutionalIdentity.ts"),
  ]);
  assert.match(server, /if \(!session\.userId\)[\s\S]*?401/);
  assert.match(server, /IdentityLinkRequiredError[\s\S]*?409/);
  assert.match(server, /No tenes permiso[\s\S]*?403/);
  assert.match(identity, /resolveCanonicalAccessUserId/);
  assert.doesNotMatch(
    `${server}\n${identity}`,
    /provisionMissing:\s*true|ensureUserRecords|automatic_default|user_roles/
  );
});

test("institutional videos GET remains strictly read-only", async () => {
  const route = await read("app/api/institution/videos/route.ts");
  const get = route.slice(
    route.indexOf("export async function GET"),
    route.indexOf("export async function POST")
  );
  assert.match(get, /\.from\("institutional_clips"\)/);
  assert.match(get, /\.eq\("institution_id", access\.institutionId\)/);
  assert.doesNotMatch(
    get,
    /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.upload\(|\.remove\(/
  );
});

test("runtime has no historical bucket or Clerk identity persistence", async () => {
  const files = await collectRuntimeFiles(["app", "components", "lib"]);
  for (const file of files) {
    if (file.endsWith(".test.mts")) continue;
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /institutional-videos/, file);
  }

  const route = await read("app/api/institution/videos/route.ts");
  assert.doesNotMatch(route, /auth\(\)|clerkSubject|user\.id/);
});

test("stored paths remain compatible with canonical signed reads", async () => {
  const [contentServer, learningServer] = await Promise.all([
    read("lib/institutional/content-server.ts"),
    read("lib/institutional/learning-server.ts"),
  ]);
  for (const source of [contentServer, learningServer]) {
    assert.match(
      source,
      /requireInstitutionContentStoragePath[\s\S]*?\.from\(INSTITUTIONAL_CONTENT_BUCKET\)[\s\S]*?\.createSignedUrl\(storagePath/
    );
  }
});

async function collectRuntimeFiles(roots: string[]) {
  const files: string[] = [];
  for (const root of roots) {
    await walk(path.join(repositoryRoot, root), files);
  }
  return files;
}

async function walk(directory: string, files: string[]) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(target, files);
    } else if (/\.(?:ts|tsx|mts|mjs)$/.test(entry.name)) {
      files.push(target);
    }
  }
}
