import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEVELOPMENT_REF, FIXTURE_PREFIX, FIXTURE_SOURCE, applyFixtures,
  assertFixtureEnvironment, cleanupFixtures, createDryRunReport, createFixturePlan, objectKey,
  resolveMediaExecutable, resolveMediaExecutables,
} from "./video-fixtures-core.mjs";

const environment = {
  ALLOW_DEVELOPMENT_VIDEO_FIXTURES: "true", APP_ENV: "development",
  SUPABASE_ENV: "development", NODE_ENV: "development", SUPABASE_PROJECT_REF: DEVELOPMENT_REF,
  NEXT_PUBLIC_SUPABASE_URL: `https://${DEVELOPMENT_REF}.supabase.co`,
  SUPABASE_SECRET_KEY: "sb_secret_synthetic-test-value",
};

test("guard accepts only the explicit local Development target", () => {
  assert.equal(assertFixtureEnvironment(environment).projectRef, DEVELOPMENT_REF);
  for (const override of [
    { APP_ENV: "production" }, { SUPABASE_ENV: "production" }, { NODE_ENV: "production" },
    { SUPABASE_PROJECT_REF: "wrongprojectref" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://wrongprojectref.supabase.co" },
    { ALLOW_DEVELOPMENT_VIDEO_FIXTURES: "false" }, { VERCEL: "1" },
  ]) assert.throws(() => assertFixtureEnvironment({ ...environment, ...override }));
});

test("guard blocks the Production reference through ref or URL", () => {
  assert.throws(() => assertFixtureEnvironment({ ...environment, SUPABASE_PROJECT_REF: "nagjddldrldwavmfaytc" }));
  assert.throws(() => assertFixtureEnvironment({ ...environment, NEXT_PUBLIC_SUPABASE_URL: "https://nagjddldrldwavmfaytc.supabase.co" }));
});

test("plan covers every active frontend video variant with four published clips", () => {
  const fixtures = createFixturePlan();
  const coverage = fixtures.flatMap(({ coverage: values }) => values);
  assert.equal(fixtures.length, 4);
  for (const expected of ["training:field", "training:var", "training:english", "futsal:video-analysis"]) assert.ok(coverage.includes(expected));
  assert.ok(fixtures.every(({ metadata }) => metadata.is_active && metadata.status === "published"));
  assert.ok(fixtures.every(({ metadata }) => metadata.video_url.startsWith(`https://${DEVELOPMENT_REF}.supabase.co/`)));
});

test("dry-run declares no connection and no writes", () => {
  const report = createDryRunReport({ ffmpeg: false, ffprobe: false });
  assert.equal(report.remote_connection_attempted, false);
  assert.equal(report.writes_planned, false);
  assert.equal(report.fixture_count, 4);
});

test("an explicit executable path is validated and takes priority over PATH", () => {
  const calls = [];
  const explicitPath = "C:\\Tools With Spaces\\ffmpeg.exe";
  const result = resolveMediaExecutable({
    environment: { FFMPEG_PATH: explicitPath },
    variableName: "FFMPEG_PATH",
    fallbackCommand: "ffmpeg",
    dependencies: {
      statSync: (path) => {
        assert.equal(path, explicitPath);
        return { isFile: () => true };
      },
      spawnSync: (command, args) => {
        calls.push({ command, args });
        return { status: 0, error: undefined };
      },
    },
  });
  assert.deepEqual(result, {
    command: explicitPath,
    available: true,
    source: "explicit",
  });
  assert.deepEqual(calls, [{ command: explicitPath, args: ["-version"] }]);
});

test("an explicit media path must exist and identify a file", () => {
  assert.throws(
    () =>
      resolveMediaExecutable({
        environment: { FFMPEG_PATH: "C:\\missing\\ffmpeg.exe" },
        variableName: "FFMPEG_PATH",
        fallbackCommand: "ffmpeg",
        dependencies: { statSync: () => { throw new Error("missing"); } },
      }),
    /existing file/
  );
  assert.throws(
    () =>
      resolveMediaExecutable({
        environment: { FFMPEG_PATH: "C:\\tools" },
        variableName: "FFMPEG_PATH",
        fallbackCommand: "ffmpeg",
        dependencies: { statSync: () => ({ isFile: () => false }) },
      }),
    /not a directory/
  );
});

test("an explicit binary that fails its version check is rejected", () => {
  assert.throws(
    () =>
      resolveMediaExecutable({
        environment: { FFPROBE_PATH: "C:\\tools\\ffprobe.exe" },
        variableName: "FFPROBE_PATH",
        fallbackCommand: "ffprobe",
        dependencies: {
          statSync: () => ({ isFile: () => true }),
          spawnSync: () => ({ status: 1, error: undefined }),
        },
      }),
    /could not be executed successfully/
  );
});

test("missing explicit paths preserve PATH fallback semantics", () => {
  const commands = [];
  const result = resolveMediaExecutables(
    {},
    {
      spawnSync: (command) => {
        commands.push(command);
        return { status: command === "ffmpeg" || command === "ffprobe" ? 0 : 1 };
      },
    }
  );
  assert.deepEqual(commands, ["ffmpeg", "ffprobe"]);
  assert.equal(result.ffmpeg.source, "path");
  assert.equal(result.ffprobe.source, "path");
  assert.equal(result.ffmpeg.available, true);
  assert.equal(result.ffprobe.available, true);
});

test("apply is idempotent when deterministic rows and objects already exist", async () => {
  const fixtures = createFixturePlan();
  const adapter = fakeAdapter({ fixtures });
  let generated = 0;
  const result = await applyFixtures({ adapter, generateMedia: async () => { generated += 1; return Buffer.from("x"); } });
  assert.equal(result.status, "already_present");
  assert.equal(generated, 0);
  assert.deepEqual(adapter.calls, []);
});

test("insert failure compensates all newly uploaded objects", async () => {
  const adapter = fakeAdapter({ insertError: new Error("synthetic insert failure") });
  await assert.rejects(applyFixtures({ adapter, generateMedia: async () => Buffer.from("x") }), /synthetic insert failure/);
  assert.deepEqual(adapter.calls.map(({ operation }) => operation), ["upload", "upload", "upload", "upload", "insert", "remove"]);
  assert.equal(adapter.calls.at(-1).fixtures.length, 4);
});

test("upload failure compensates only earlier uploads", async () => {
  const adapter = fakeAdapter({ uploadFailureAt: 2 });
  await assert.rejects(applyFixtures({ adapter, generateMedia: async () => Buffer.from("x") }), /synthetic upload failure/);
  assert.equal(adapter.calls.find(({ operation }) => operation === "remove").fixtures.length, 1);
});

test("cleanup is restricted to fixture IDs and prefix", async () => {
  const fixtures = createFixturePlan();
  const adapter = fakeAdapter({ fixtures });
  const result = await cleanupFixtures({ adapter });
  assert.equal(result.removed_rows.length, 4);
  assert.equal(result.removed_objects.length, 4);
  const deletion = adapter.calls.find(({ operation }) => operation === "delete");
  assert.ok(deletion.fixtures.every(({ path }) => path.startsWith(`${FIXTURE_PREFIX}/`)));
  assert.ok(deletion.fixtures.every(({ metadata }) => metadata.source_official === FIXTURE_SOURCE));
});

test("fixture implementation has no identity provisioning or legacy role dependency", () => {
  const source = ["video-fixtures-core.mjs", "video-fixtures.mjs"].map((name) => readFileSync(new URL(name, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(source, /user_roles|automatic_default|Clerk|auth\(\)\.userId|request\.jwt/i);
});

test("the loader uses the centralized executable resolution for all media work", () => {
  const loader = readFileSync(new URL("video-fixtures.mjs", import.meta.url), "utf8");
  const media = readFileSync(new URL("video-fixtures-core.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(loader, /spawnSync\(|["']ffmpeg["']|["']ffprobe["']/);
  assert.match(media, /executables\.ffmpeg\.command/);
  assert.match(media, /executables\.ffprobe\.command/);
});

function fakeAdapter({ fixtures = [], insertError = null, uploadFailureAt = null } = {}) {
  const rowsById = new Map(fixtures.map((item) => [item.id, item.metadata]));
  const objectKeys = new Set(fixtures.map(objectKey));
  let uploadCount = 0;
  return {
    calls: [],
    async inspect() { return { rowsById, objectKeys }; },
    async upload(fixture) {
      uploadCount += 1;
      if (uploadFailureAt === uploadCount) throw new Error("synthetic upload failure");
      this.calls.push({ operation: "upload", fixture });
    },
    async insertRows(rows) { this.calls.push({ operation: "insert", rows }); if (insertError) throw insertError; },
    async deleteRows(fixturesToDelete) { this.calls.push({ operation: "delete", fixtures: fixturesToDelete }); },
    async removeObjects(fixturesToRemove) { this.calls.push({ operation: "remove", fixtures: fixturesToRemove }); },
  };
}
