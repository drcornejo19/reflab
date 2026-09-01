import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  FIXTURE_SOURCE, applyFixtures, assertFixtureEnvironment, cleanupFixtures,
  createDryRunReport, generateSyntheticVideo, objectKey, resolveMediaExecutables,
} from "./video-fixtures-core.mjs";

const mode = parseMode(process.argv.slice(2));
const target = assertFixtureEnvironment(process.env);
const mediaExecutables = resolveMediaExecutables(process.env);
const mediaTools = {
  ffmpeg: mediaExecutables.ffmpeg.available,
  ffprobe: mediaExecutables.ffprobe.available,
};

if (mode === "dry-run") {
  process.stdout.write(`${JSON.stringify({ target, ...createDryRunReport(mediaTools) }, null, 2)}\n`);
  process.exit(0);
}
if (mode === "apply" && (!mediaTools.ffmpeg || !mediaTools.ffprobe)) {
  throw new Error("FFmpeg and FFprobe are required before applying Development video fixtures.");
}

// The remote client is intentionally constructed only after dry-run has exited.
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const adapter = createAdapter(supabase);

if (mode === "cleanup") {
  process.stdout.write(`${JSON.stringify({ target, mode, ...(await cleanupFixtures({ adapter })) }, null, 2)}\n`);
  process.exit(0);
}

const mediaRoot = mkdtempSync(join(tmpdir(), "reflab-video-fixtures-"));
try {
  const result = await applyFixtures({
    adapter,
    generateMedia: (fixture) =>
      generateSyntheticVideo({ fixture, mediaRoot, executables: mediaExecutables }).data,
  });
  process.stdout.write(`${JSON.stringify({ target, mode, ...result }, null, 2)}\n`);
} finally {
  rmSync(mediaRoot, { recursive: true, force: true });
}

function parseMode(args) {
  const modes = args.filter((value) => ["--dry-run", "--apply", "--cleanup"].includes(value));
  if (modes.length !== 1 || args.length !== 1) throw new Error("Use exactly one mode: --dry-run, --apply, or --cleanup.");
  return modes[0].slice(2);
}

function createAdapter(client) {
  return {
    async inspect(fixtures) {
      const rows = await client.from("clips").select("id,video_url,source_official,sport_type,mode,title").in("id", fixtures.map(({ id }) => id));
      noError(rows.error, "inspect clip fixtures");
      const objectKeys = new Set();
      for (const fixture of fixtures) {
        const folder = dirname(fixture.path).replaceAll("\\", "/");
        const listed = await client.storage.from(fixture.bucket).list(folder, { limit: 10, search: basename(fixture.path) });
        noError(listed.error, `inspect ${fixture.key} object`);
        if ((listed.data ?? []).some(({ name }) => name === basename(fixture.path))) objectKeys.add(objectKey(fixture));
      }
      return { rowsById: new Map((rows.data ?? []).map((row) => [row.id, row])), objectKeys };
    },
    async upload(fixture, media) {
      const result = await client.storage.from(fixture.bucket).upload(fixture.path, media, { contentType: "video/mp4", cacheControl: "3600", upsert: false });
      noError(result.error, `upload ${fixture.key}`);
    },
    async insertRows(rows) {
      const result = await client.from("clips").insert(rows);
      noError(result.error, "insert clip fixture metadata");
    },
    async deleteRows(fixtures) {
      const result = await client.from("clips").delete().in("id", fixtures.map(({ id }) => id)).eq("source_official", FIXTURE_SOURCE).select("id");
      noError(result.error, "delete clip fixture metadata");
      if ((result.data ?? []).length !== fixtures.length) throw new Error("Cleanup did not delete the exact expected fixture rows.");
    },
    async removeObjects(fixtures) {
      for (const [bucket, items] of groupByBucket(fixtures)) {
        const result = await client.storage.from(bucket).remove(items.map(({ path }) => path));
        noError(result.error, `remove fixtures from ${bucket}`);
      }
    },
  };
}

function groupByBucket(fixtures) {
  const groups = new Map();
  for (const fixture of fixtures) groups.set(fixture.bucket, [...(groups.get(fixture.bucket) ?? []), fixture]);
  return groups;
}

function noError(error, operation) {
  if (!error) return;
  throw new Error(`${operation} failed (${typeof error.code === "string" ? error.code : "unknown"}): ${typeof error.message === "string" ? error.message : "Supabase operation failed"}`);
}
