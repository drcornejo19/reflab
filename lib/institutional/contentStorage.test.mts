import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildInstitutionContentStoragePath,
  INSTITUTIONAL_CONTENT_BUCKET,
  InstitutionalContentStorageError,
  MAXIMUM_INSTITUTIONAL_CONTENT_SIZE,
  requireInstitutionContentStoragePath,
  requireInstitutionContentUploadPath,
  validateInstitutionContentUpload,
} from "./contentStorage.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const institutionA = "11111111-1111-4111-8111-111111111111";
const institutionB = "22222222-2222-4222-8222-222222222222";
const objectId = "33333333-3333-4333-8333-333333333333";
const canonicalUserId = "user_dev_referee_a";
const canonicalPath =
  `${institutionA}/${canonicalUserId}/content/${objectId}.mp4`;

async function read(relativePath: string) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("institutional content uses only the canonical private bucket", () => {
  assert.equal(INSTITUTIONAL_CONTENT_BUCKET, "institutional-content");
});

test("tenant A can persist and sign only paths rooted in tenant A", () => {
  assert.equal(
    requireInstitutionContentStoragePath(canonicalPath, institutionA),
    canonicalPath
  );
  assert.throws(
    () => requireInstitutionContentStoragePath(canonicalPath, institutionB),
    (error: unknown) =>
      error instanceof InstitutionalContentStorageError && error.status === 403
  );
});

test("traversal, encoded prefixes, backslashes and absolute URLs are rejected", () => {
  for (const storagePath of [
    `${institutionA}/../secret.mp4`,
    `${institutionA}/%2e%2e/secret.mp4`,
    `${institutionA}\\secret.mp4`,
    `https://storage.example/${institutionA}/secret.mp4`,
    `/${institutionA}/secret.mp4`,
    `${institutionA}//secret.mp4`,
  ]) {
    assert.throws(
      () => requireInstitutionContentStoragePath(storagePath, institutionA),
      (error: unknown) =>
        error instanceof InstitutionalContentStorageError && error.status === 400,
      storagePath
    );
  }
});

test("paths without the exact authorized tenant prefix are rejected", () => {
  assert.throws(
    () =>
      requireInstitutionContentStoragePath(
        `${canonicalUserId}/content/${objectId}.mp4`,
        institutionA
      ),
    InstitutionalContentStorageError
  );
});

test("new upload paths require the authorized canonical user namespace", () => {
  assert.equal(
    requireInstitutionContentUploadPath({
      storagePath: canonicalPath,
      institutionId: institutionA,
      canonicalUserId,
    }),
    canonicalPath
  );
  assert.throws(() =>
    requireInstitutionContentUploadPath({
      storagePath: `${institutionA}/another_user/content/${objectId}.mp4`,
      institutionId: institutionA,
      canonicalUserId,
    })
  );
});

test("upload paths and extensions are derived server-side from MIME", () => {
  const upload = validateInstitutionContentUpload({
    filename: "misleading.exe",
    mimeType: "video/mp4",
    size: 1024,
  });
  assert.deepEqual(upload, { extension: "mp4", mimeType: "video/mp4" });
  assert.equal(
    buildInstitutionContentStoragePath({
      institutionId: institutionA,
      canonicalUserId,
      objectId,
      extension: upload.extension,
    }),
    canonicalPath
  );
});

test("invalid MIME and oversized uploads are rejected before signing", () => {
  assert.throws(() =>
    validateInstitutionContentUpload({
      filename: "payload.bin",
      mimeType: "application/octet-stream",
      size: 10,
    })
  );
  assert.throws(() =>
    validateInstitutionContentUpload({
      filename: "large.mp4",
      mimeType: "video/mp4",
      size: MAXIMUM_INSTITUTIONAL_CONTENT_SIZE + 1,
    })
  );
});

test("the upload endpoint derives path and tenant only after authorization", async () => {
  const route = await read("app/api/institution/contents/upload/route.ts");
  assert.match(route, /requireInstitutionUserId\(\)/);
  assert.match(route, /requireInstitutionPermission\([\s\S]*?"content\.manage"/);
  assert.match(route, /institutionId: authorization\.context\.institution\.id/);
  assert.match(route, /canonicalUserId: authorization\.userId/);
  assert.match(route, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.doesNotMatch(route, /body\.storagePath/);
});

test("POST and PATCH validate storage paths against the authorized tenant", async () => {
  const server = await read("lib/institutional/content-server.ts");
  assert.match(server, /requireInstitutionContentUploadPath\(/);
  assert.match(server, /institutionId: authorization\.context\.institution\.id/);
  assert.match(server, /canonicalUserId: authorization\.userId/);
  assert.match(server, /storage_path: storagePath/);
  assert.match(server, /assertStoragePathIsUnreferenced\(authorization, storagePath\)/);
  assert.match(
    server,
    /if \(error \|\| !data\) \{[\s\S]*?removeInstitutionStorageObject/
  );
});

test("signed reads validate persisted and snapshot paths before signing", async () => {
  const [contentServer, learningServer, assessmentServer] = await Promise.all([
    read("lib/institutional/content-server.ts"),
    read("lib/institutional/learning-server.ts"),
    read("lib/institutional/assessment-server.ts"),
  ]);
  assert.match(
    contentServer,
    /requireInstitutionContentStoragePath[\s\S]*?createSignedUrl\(storagePath/
  );
  assert.match(
    learningServer,
    /requireInstitutionContentStoragePath[\s\S]*?createSignedUrl\(storagePath/
  );
  assert.match(assessmentServer, /storagePath: contentStoragePath\(authorization/);
});

test("institutional content GET remains read-only", async () => {
  const route = await read("app/api/institution/contents/route.ts");
  const get = route.slice(
    route.indexOf("export async function GET"),
    route.indexOf("export async function POST")
  );
  assert.doesNotMatch(
    get,
    /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.upload\(|\.remove\(/
  );
});

test("identity errors stay JSON and institutional storage persists no Clerk IDs", async () => {
  const [server, identity, contentServer] = await Promise.all([
    read("lib/institutional/server.ts"),
    read("lib/institutional/institutionalIdentity.ts"),
    read("lib/institutional/content-server.ts"),
  ]);
  const identityResolver = server.slice(
    server.indexOf("export async function requireInstitutionUserId"),
    server.indexOf("export async function getRequestedInstitutionId")
  );
  assert.match(identityResolver, /if \(!session\.userId\)[\s\S]*?401/);
  assert.match(identityResolver, /IdentityLinkRequiredError[\s\S]*?409/);
  assert.match(server, /No tenes permiso[\s\S]*?403/);
  assert.match(identity, /resolveCanonicalAccessUserId/);
  assert.match(contentServer, /author_user_id: authorization\.userId/);
  assert.doesNotMatch(
    `${identityResolver}\n${identity}\n${contentServer}`,
    /user_roles|automatic_default|ensureUserRecords|author_user_id:\s*(?:session|clerk)/
  );
});
