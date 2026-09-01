import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  AVATAR_BUCKET,
  AvatarValidationError,
  CanonicalProfileRequiredError,
  MAX_AVATAR_BYTES,
  createAvatarUploadResponse,
  getOwnedAvatarObjectPath,
  sanitizeAvatarError,
  uploadCanonicalAvatar,
  validateAvatarFile,
} from "./avatarUpload.ts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const routeSource = readFileSync(
  resolve(repositoryRoot, "app", "api", "profile", "avatar", "route.ts"),
  "utf8"
);
const SUPABASE_URL = "https://development-project.supabase.co";
const OBJECT_ID = "11111111-1111-4111-8111-111111111111";

const linkedAccess: AccessSnapshot = {
  userId: "user_dev_referee_a",
  globalRole: "referee",
  individualPlan: "pro",
  effectiveIndividualPlan: "pro",
  capabilities: ["advanced_individual"],
  sources: ["individual"],
  inheritedFromInstitutionIds: ["30000000-0000-4000-8000-000000000001"],
};

const syntheticClerkUser = {
  id: "user_clerk_linked",
  emailAddresses: [
    { id: "email_synthetic", emailAddress: "referee-a@example.invalid" },
  ],
  primaryEmailAddressId: "email_synthetic",
  firstName: "Referee",
  lastName: "A",
  username: "referee-a",
  imageUrl: "",
  createdAt: Date.parse("2026-07-27T00:00:00.000Z"),
  updatedAt: Date.parse("2026-07-27T00:00:00.000Z"),
};

const canonicalProfile = {
  user_id: "user_dev_referee_a",
  reflab_name: "Referee A",
  first_name: "Referee",
  last_name: "A",
  ref_card_id: "RF-DEV-A",
  subscription_plan: "pro",
  institution_id: "30000000-0000-4000-8000-000000000001",
  avatar_url: null,
};

type FakeOptions = {
  oldAvatarUrl?: string | null;
  profileMissing?: boolean;
  removeErrors?: Record<string, { code?: string; message: string }>;
  updateError?: { code?: string; message: string } | null;
  updateReturnsNoRow?: boolean;
  uploadError?: { code?: string; message: string } | null;
};

function createFakeAvatarClient(options: FakeOptions = {}) {
  const operations: Array<Record<string, unknown>> = [];
  let updatePayload: Record<string, unknown> | null = null;
  const profile = {
    ...canonicalProfile,
    avatar_url: options.oldAvatarUrl ?? null,
  };

  const client = {
    from(table: string) {
      operations.push({ operation: "from", table });
      assert.equal(table, "user_profiles");

      return {
        select(columns: string) {
          operations.push({ operation: "select_profile", table, columns });
          return {
            eq(column: string, userId: string) {
              operations.push({ operation: "select_eq", table, column, userId });
              assert.equal(column, "user_id");
              assert.equal(userId, linkedAccess.userId);
              return {
                async maybeSingle() {
                  operations.push({ operation: "select_single", table });
                  return {
                    data: options.profileMissing ? null : profile,
                    error: null,
                  };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          updatePayload = payload;
          operations.push({ operation: "update", table, payload });
          return {
            eq(column: string, userId: string) {
              operations.push({ operation: "update_eq", table, column, userId });
              assert.equal(column, "user_id");
              assert.equal(userId, linkedAccess.userId);
              return {
                select(columns: string) {
                  operations.push({ operation: "update_select", table, columns });
                  return {
                    async maybeSingle() {
                      operations.push({ operation: "update_single", table });
                      return {
                        data:
                          options.updateReturnsNoRow || options.updateError
                            ? null
                            : { ...profile, ...updatePayload },
                        error: options.updateError ?? null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        operations.push({ operation: "storage_from", bucket });
        assert.equal(bucket, AVATAR_BUCKET);
        return {
          async upload(
            path: string,
            _file: File,
            uploadOptions: Record<string, unknown>
          ) {
            operations.push({
              operation: "upload",
              bucket,
              path,
              uploadOptions,
            });
            return { data: options.uploadError ? null : { path }, error: options.uploadError ?? null };
          },
          getPublicUrl(path: string) {
            operations.push({ operation: "public_url", bucket, path });
            return {
              data: {
                publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
              },
            };
          },
          async remove(paths: string[]) {
            const path = paths[0];
            operations.push({ operation: "remove", bucket, paths });
            return {
              data: options.removeErrors?.[path] ? null : paths,
              error: options.removeErrors?.[path] ?? null,
            };
          },
        };
      },
    },
  };

  return { client, operations, getUpdatePayload: () => updatePayload };
}

function createDependencies(overrides: Record<string, unknown> = {}) {
  const cleanupLogs: unknown[] = [];
  const accessCalls: Array<Record<string, unknown>> = [];
  return {
    cleanupLogs,
    accessCalls,
    dependencies: {
      createObjectId: () => OBJECT_ID,
      async loadAccessSnapshot(
        _client: unknown,
        externalUserId: string,
        options: { provisionMissing: false }
      ) {
        accessCalls.push({ externalUserId, options });
        return linkedAccess;
      },
      logCleanupFailure: (diagnostic: unknown) => cleanupLogs.push(diagnostic),
      now: () => new Date("2026-08-10T12:00:00.000Z"),
      supabaseUrl: () => SUPABASE_URL,
      ...overrides,
    },
  };
}

function avatarFile(
  mimeType: string,
  bytes: number[],
  name = "avatar.bin"
) {
  return new File([new Uint8Array(bytes)], name, { type: mimeType });
}

const validFiles = {
  png: avatarFile(
    "image/png",
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00],
    "avatar.png"
  ),
  jpg: avatarFile(
    "image/jpeg",
    [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
    "avatar.jpg"
  ),
  webp: avatarFile(
    "image/webp",
    [0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
    "avatar.webp"
  ),
};

for (const [extension, file] of Object.entries(validFiles)) {
  test(`valid ${extension.toUpperCase()} uses its detected extension and updates only the canonical profile`, async () => {
    const fake = createFakeAvatarClient();
    const context = createDependencies();
    const result = await uploadCanonicalAvatar(
      fake.client as never,
      syntheticClerkUser.id,
      syntheticClerkUser as never,
      file,
      context.dependencies as never
    );

    assert.equal(
      result.objectPath,
      `${linkedAccess.userId}/${OBJECT_ID}.${extension}`
    );
    assert.equal(result.profile.refCardId, "RF-DEV-A");
    assert.equal(result.profile.subscriptionPlan, "pro");
    assert.equal(fake.getUpdatePayload()?.avatar_url, result.avatarUrl);
    assert.deepEqual(context.accessCalls, [
      {
        externalUserId: syntheticClerkUser.id,
        options: { provisionMissing: false },
      },
    ]);
    assert.ok(
      fake.operations
        .filter((operation) => operation.operation === "from")
        .every((operation) => operation.table === "user_profiles")
    );
  });
}

test("an unlinked identity returns identity_link_required before profile or Storage access", async () => {
  const fake = createFakeAvatarClient();
  const context = createDependencies({
    async loadAccessSnapshot() {
      throw new IdentityLinkRequiredError();
    },
  });
  const response = await createAvatarUploadResponse(() =>
    uploadCanonicalAvatar(
      fake.client as never,
      syntheticClerkUser.id,
      syntheticClerkUser as never,
      validFiles.png,
      context.dependencies as never
    )
  );

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "identity_link_required" });
  assert.deepEqual(fake.operations, []);
});

test("a missing canonical profile is rejected without uploading", async () => {
  const fake = createFakeAvatarClient({ profileMissing: true });
  const context = createDependencies();

  await assert.rejects(
    uploadCanonicalAvatar(
      fake.client as never,
      syntheticClerkUser.id,
      syntheticClerkUser as never,
      validFiles.png,
      context.dependencies as never
    ),
    CanonicalProfileRequiredError
  );
  assert.equal(
    fake.operations.some((operation) => operation.operation === "upload"),
    false
  );
});

test("an avatar larger than 5 MiB is rejected before upload", async () => {
  const oversized = new File(
    [new Uint8Array(MAX_AVATAR_BYTES + 1)],
    "oversized.png",
    { type: "image/png" }
  );
  await assert.rejects(
    validateAvatarFile(oversized),
    (error: unknown) =>
      error instanceof AvatarValidationError && error.code === "avatar_too_large"
  );
});

test("a false MIME declaration is rejected", async () => {
  const falseMime = avatarFile(
    "image/jpeg",
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );
  await assert.rejects(
    validateAvatarFile(falseMime),
    (error: unknown) =>
      error instanceof AvatarValidationError && error.code === "avatar_mime_mismatch"
  );
});

test("an invalid file signature is rejected", async () => {
  const invalid = avatarFile("image/png", [0x00, 0x01, 0x02, 0x03]);
  await assert.rejects(
    validateAvatarFile(invalid),
    (error: unknown) =>
      error instanceof AvatarValidationError && error.code === "avatar_signature_invalid"
  );
});

test("the client cannot choose the bucket, path or target user", async () => {
  const fake = createFakeAvatarClient();
  const context = createDependencies();
  const maliciousName = avatarFile(
    "image/png",
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "../../user_dev_referee_b/evil.png"
  );
  const result = await uploadCanonicalAvatar(
    fake.client as never,
    syntheticClerkUser.id,
    syntheticClerkUser as never,
    maliciousName,
    context.dependencies as never
  );

  assert.match(result.objectPath, /^user_dev_referee_a\//);
  assert.doesNotMatch(result.objectPath, /referee_b|evil|\.\./);
  assert.ok(
    fake.operations
      .filter((operation) => operation.operation === "storage_from")
      .every((operation) => operation.bucket === AVATAR_BUCKET)
  );
  assert.doesNotMatch(routeSource, /formData\.get\(["'](?:bucket|path|user_?id)["']\)/i);
});

test("the avatar flow never imports, queries or writes legacy user_roles", () => {
  assert.doesNotMatch(routeSource, /ensureUserRecords|user_roles|upsertUserRole/);
});

test("an upload failure leaves the profile unchanged and creates no cleanup write", async () => {
  const fake = createFakeAvatarClient({
    uploadError: { code: "storage_error", message: "upload rejected" },
  });
  const context = createDependencies();

  await assert.rejects(
    uploadCanonicalAvatar(
      fake.client as never,
      syntheticClerkUser.id,
      syntheticClerkUser as never,
      validFiles.png,
      context.dependencies as never
    )
  );
  assert.equal(
    fake.operations.some((operation) => operation.operation === "update"),
    false
  );
  assert.equal(
    fake.operations.some((operation) => operation.operation === "remove"),
    false
  );
});

test("a profile UPDATE failure removes the newly uploaded object", async () => {
  const fake = createFakeAvatarClient({
    updateError: { code: "42501", message: "profile update denied" },
  });
  const context = createDependencies();

  await assert.rejects(
    uploadCanonicalAvatar(
      fake.client as never,
      syntheticClerkUser.id,
      syntheticClerkUser as never,
      validFiles.png,
      context.dependencies as never
    )
  );
  const removals = fake.operations.filter(
    (operation) => operation.operation === "remove"
  );
  assert.deepEqual(removals[0]?.paths, [
    `${linkedAccess.userId}/${OBJECT_ID}.png`,
  ]);
});

test("a successful UPDATE points the profile to the new avatar", async () => {
  const fake = createFakeAvatarClient();
  const context = createDependencies();
  const result = await uploadCanonicalAvatar(
    fake.client as never,
    syntheticClerkUser.id,
    syntheticClerkUser as never,
    validFiles.png,
    context.dependencies as never
  );

  assert.equal(fake.getUpdatePayload()?.avatar_url, result.avatarUrl);
  assert.equal(result.profile.avatarUrl, result.avatarUrl);
});

test("the previous object is removed only after a successful profile UPDATE", async () => {
  const previousPath = `${linkedAccess.userId}/profile.png`;
  const fake = createFakeAvatarClient({
    oldAvatarUrl: `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${previousPath}?v=old`,
  });
  const context = createDependencies();
  await uploadCanonicalAvatar(
    fake.client as never,
    syntheticClerkUser.id,
    syntheticClerkUser as never,
    validFiles.png,
    context.dependencies as never
  );

  const updatePosition = fake.operations.findIndex(
    (operation) => operation.operation === "update_single"
  );
  const removePosition = fake.operations.findIndex(
    (operation) => operation.operation === "remove"
  );
  assert.ok(updatePosition >= 0 && removePosition > updatePosition);
  assert.deepEqual(fake.operations[removePosition]?.paths, [previousPath]);
});

test("an object outside the canonical prefix is never deleted", async () => {
  const foreignPath = "user_dev_referee_b/profile.png";
  const foreignUrl = `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${foreignPath}`;
  const fake = createFakeAvatarClient({ oldAvatarUrl: foreignUrl });
  const context = createDependencies();
  await uploadCanonicalAvatar(
    fake.client as never,
    syntheticClerkUser.id,
    syntheticClerkUser as never,
    validFiles.png,
    context.dependencies as never
  );

  assert.equal(
    fake.operations.some((operation) => operation.operation === "remove"),
    false
  );
  assert.equal(
    getOwnedAvatarObjectPath(foreignUrl, linkedAccess.userId, SUPABASE_URL),
    null
  );
});

test("old-object cleanup failures are sanitized and do not revert the updated profile", async () => {
  const previousPath = `${linkedAccess.userId}/profile.png`;
  const fake = createFakeAvatarClient({
    oldAvatarUrl: `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${previousPath}`,
    removeErrors: {
      [previousPath]: {
        code: "cleanup_failed",
        message: "Bearer secret-value user_clerk_sensitive could not be removed",
      },
    },
  });
  const context = createDependencies();
  const result = await uploadCanonicalAvatar(
    fake.client as never,
    syntheticClerkUser.id,
    syntheticClerkUser as never,
    validFiles.png,
    context.dependencies as never
  );

  assert.equal(result.profile.avatarUrl, result.avatarUrl);
  assert.deepEqual(context.cleanupLogs, [
    {
      code: "cleanup_failed",
      message: "Bearer [redacted] [redacted-user] could not be removed",
    },
  ]);
});

test("structured avatar errors never stringify objects or expose tokens", () => {
  const diagnostic = sanitizeAvatarError({
    code: "42501",
    message: "Bearer secret eyJheader.payload.signature user_clerk_sensitive",
  });
  assert.deepEqual(diagnostic, {
    code: "42501",
    message: "Bearer [redacted] [redacted] [redacted-user]",
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), /\[object Object\]|secret|eyJheader/);
});
