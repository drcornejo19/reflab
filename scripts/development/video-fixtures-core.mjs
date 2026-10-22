import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const DEVELOPMENT_REF = "bthnhbpgiyuajsgoccrp";
export const PRODUCTION_REF = "nagjddldrldwavmfaytc";
export const FIXTURE_PREFIX = "development-fixtures/reflab-video-smoke-v1";
export const FIXTURE_SOURCE = "reflab_development_video_fixture_v1";

const definitions = [
  fixture("001", "football-field", "Videos", "football_11", "field", "Dispute", ["training:field", "training:video-analysis", "exam:football_11"], { correct_foul: false, correct_restart: "Seguir el juego", correct_discipline: "Sin tarjeta" }),
  fixture("002", "football-var", "Videos", "football_11", "var", "VAR", ["training:var", "exam:football_11"], { correct_var: true, incident_type: "potential_penalty", correct_clear_error: "yes", correct_app_status: "same_app", correct_var_decision: "recommend_ofr" }),
  fixture("003", "football-english", "Videos Modo Ingles", "football_11", "english", "English Referee", ["training:english", "training:communication", "training:var:english"], { language: "en" }),
  fixture("004", "futsal-field", "Videos", "futsal", "field", "Handball", ["futsal:video-analysis", "exam:futsal"], {
    correct_foul: true, correct_restart: "Tiro libre directo", correct_discipline: "Sin sancion",
    rule_reference: "Synthetic QA rule reference", source_version: "development-fixture-v1",
    governing_body: "FIFA", technical_resolution: "Tiro libre directo sintetico.",
    analysis_answers: { technical_decision: true, restart: "Tiro libre directo", disciplinary_action: "Sin sancion", subtype: "mano_sancionable" },
  }),
];

export function assertFixtureEnvironment(environment) {
  const ref = environment.SUPABASE_PROJECT_REF?.trim();
  const app = environment.APP_ENV?.trim().toLowerCase();
  const supabase = environment.SUPABASE_ENV?.trim().toLowerCase();
  const node = environment.NODE_ENV?.trim().toLowerCase();
  const url = parseProjectUrl(environment.NEXT_PUBLIC_SUPABASE_URL);
  if ([ref, url.ref].includes(PRODUCTION_REF) || [app, supabase, node].includes("production")) {
    throw new Error("Development video fixtures are blocked for Production.");
  }
  if (environment.VERCEL || environment.VERCEL_ENV || environment.VERCEL_URL) {
    throw new Error("Development video fixtures are blocked in deployed runtimes.");
  }
  if (environment.ALLOW_DEVELOPMENT_VIDEO_FIXTURES !== "true" || app !== "development" || supabase !== "development" || ref !== DEVELOPMENT_REF || url.ref !== DEVELOPMENT_REF) {
    throw new Error("Development video fixture environment is not explicitly authorized.");
  }
  if (!environment.SUPABASE_SECRET_KEY?.trim().startsWith("sb_secret_")) {
    throw new Error("SUPABASE_SECRET_KEY is required for Development video fixtures.");
  }
  return { environment: app, projectRef: ref, hostname: url.hostname };
}

export function createFixturePlan() {
  return definitions.map((item) => ({
    ...structuredClone(item),
    metadata: {
      id: item.id, ...structuredClone(item.metadata), video_url: publicUrl(item.bucket, item.path),
      source_official: FIXTURE_SOURCE, normative_status: "development_fixture", is_active: true, status: "published",
    },
  }));
}

export function createDryRunReport(mediaTools) {
  const fixtures = createFixturePlan();
  return {
    mode: "dry-run", remote_connection_attempted: false, writes_planned: false,
    fixture_count: fixtures.length, media_tools: mediaTools,
    fixtures: fixtures.map(({ id, key, bucket, path, coverage, metadata }) => ({ id, key, bucket, path, coverage, metadata })),
    operations_for_apply: ["validate guard and FFmpeg/FFprobe", "inspect deterministic clip IDs and object paths", "generate and decode-validate missing MP4 files in OS temp", "upload missing objects without overwrite", "insert missing clips rows", "remove only objects uploaded by this run if a later step fails"],
    cleanup: { clip_ids: fixtures.map(({ id }) => id), storage_prefix: FIXTURE_PREFIX },
  };
}

export async function applyFixtures({ adapter, generateMedia }) {
  const fixtures = createFixturePlan();
  const state = await adapter.inspect(fixtures);
  validateState(fixtures, state, true);
  const missingObjects = fixtures.filter((item) => !state.objectKeys.has(objectKey(item)));
  const missingRows = fixtures.filter((item) => !state.rowsById.has(item.id));
  const uploaded = [];
  try {
    for (const item of missingObjects) {
      await adapter.upload(item, await generateMedia(item));
      uploaded.push(item);
    }
    if (missingRows.length) await adapter.insertRows(missingRows.map(({ metadata }) => metadata));
  } catch (error) {
    if (uploaded.length) await adapter.removeObjects(uploaded);
    throw error;
  }
  return { status: missingObjects.length || missingRows.length ? "created" : "already_present", uploaded: uploaded.map(objectKey), inserted: missingRows.map(({ id }) => id) };
}

export async function cleanupFixtures({ adapter }) {
  const fixtures = createFixturePlan();
  assertCleanupScope(fixtures);
  const state = await adapter.inspect(fixtures);
  validateState(fixtures, state, false);
  const rows = fixtures.filter(({ id }) => state.rowsById.has(id));
  const objects = fixtures.filter((item) => state.objectKeys.has(objectKey(item)));
  if (rows.length) await adapter.deleteRows(rows);
  if (objects.length) await adapter.removeObjects(objects);
  return { status: rows.length || objects.length ? "removed" : "already_absent", removed_rows: rows.map(({ id }) => id), removed_objects: objects.map(objectKey) };
}

export function objectKey(item) { return `${item.bucket}/${item.path}`; }

export function resolveMediaExecutables(environment, dependencies = {}) {
  return {
    ffmpeg: resolveMediaExecutable({
      environment,
      variableName: "FFMPEG_PATH",
      fallbackCommand: "ffmpeg",
      dependencies,
    }),
    ffprobe: resolveMediaExecutable({
      environment,
      variableName: "FFPROBE_PATH",
      fallbackCommand: "ffprobe",
      dependencies,
    }),
  };
}

export function resolveMediaExecutable({
  environment,
  variableName,
  fallbackCommand,
  dependencies = {},
}) {
  const configuredPath = environment[variableName]?.trim();
  const inspectFile = dependencies.statSync ?? statSync;
  const run = dependencies.spawnSync ?? spawnSync;

  if (configuredPath) {
    let stats;
    try {
      stats = inspectFile(configuredPath);
    } catch {
      throw new Error(`${variableName} does not identify an existing file.`);
    }
    if (!stats.isFile()) {
      throw new Error(`${variableName} must identify a file, not a directory.`);
    }
  }

  const command = configuredPath || fallbackCommand;
  const version = run(command, ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const available = !version.error && version.status === 0;
  if (configuredPath && !available) {
    throw new Error(`${variableName} exists but could not be executed successfully.`);
  }

  return {
    command,
    available,
    source: configuredPath ? "explicit" : "path",
  };
}

export function generateSyntheticVideo({ fixture, mediaRoot, executables }) {
  const output = join(mediaRoot, `${fixture.key}.mp4`);
  const generated = spawnSync(executables.ffmpeg.command, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${fixture.color}:s=320x180:d=2:r=24`,
    "-f", "lavfi", "-i", `sine=frequency=${fixture.frequency}:duration=2`,
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    "-b:a", "64k", "-movflags", "+faststart", output,
  ], { encoding: "utf8", windowsHide: true });
  assertToolSuccess(generated, `generate ${fixture.key}`);

  const probed = spawnSync(executables.ffprobe.command, [
    "-v", "error",
    "-show_entries", "format=format_name,duration,size:stream=codec_type,codec_name,width,height",
    "-of", "json", output,
  ], { encoding: "utf8", windowsHide: true });
  assertToolSuccess(probed, `inspect ${fixture.key}`);

  const inspection = JSON.parse(probed.stdout);
  const video = inspection.streams?.find((stream) => stream.codec_type === "video");
  const audio = inspection.streams?.find((stream) => stream.codec_type === "audio");
  const formats = String(inspection.format?.format_name ?? "").split(",");
  const duration = Number(inspection.format?.duration ?? 0);
  if (
    !formats.includes("mp4") || video?.codec_name !== "h264" ||
    audio?.codec_name !== "aac" || video.width !== 320 || video.height !== 180 ||
    duration < 1.9 || duration > 2.1
  ) {
    throw new Error(`Generated fixture ${fixture.key} is not the expected MP4 H.264/AAC media.`);
  }

  const decoded = spawnSync(
    executables.ffmpeg.command,
    ["-v", "error", "-i", output, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true }
  );
  assertToolSuccess(decoded, `decode ${fixture.key}`);

  return {
    data: readFileSync(output),
    inspection: {
      container: "mp4", videoCodec: video.codec_name, audioCodec: audio.codec_name,
      width: video.width, height: video.height, durationSeconds: duration,
      sizeBytes: Number(inspection.format.size),
    },
  };
}

function fixture(suffix, key, bucket, sportType, mode, topic, coverage, extra) {
  return {
    id: `d3f00000-0000-4000-8000-000000000${suffix}`, key, bucket,
    path: `${FIXTURE_PREFIX}/${key}.mp4`,
    color: { "001": "0x1f7a4d", "002": "0x174f7a", "003": "0x7a5b17", "004": "0x6a247a" }[suffix],
    frequency: { "001": 440, "002": 554, "003": 659, "004": 784 }[suffix], coverage,
    metadata: { sport_type: sportType, title: `[DEV FIXTURE] ${key.replaceAll("-", " ")}`, description: "Contenido audiovisual sintetico para QA en Development.", topic, difficulty: "Basic", mode, explanation: "Fixture sintetico de RefLab Development.", language: extra.language ?? "es", ...extra },
  };
}

function parseProjectUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("NEXT_PUBLIC_SUPABASE_URL is invalid."); }
  const hostname = parsed.hostname.toLowerCase();
  const ref = hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
  if (parsed.protocol !== "https:" || !ref || parsed.username || parsed.password) throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a credential-free HTTPS project URL.");
  return { hostname, ref };
}

function publicUrl(bucket, path) {
  return `https://${DEVELOPMENT_REF}.supabase.co/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function validateState(fixtures, state, rejectOrphanObject) {
  for (const item of fixtures) {
    const row = state.rowsById.get(item.id);
    if (row) for (const key of ["id", "video_url", "source_official", "sport_type", "mode", "title"]) if (row[key] !== item.metadata[key]) throw new Error(`Fixture metadata conflict for ${item.key}.`);
    if (rejectOrphanObject && state.objectKeys.has(objectKey(item)) && !row) throw new Error(`Fixture object conflict for ${item.key}; cleanup is required first.`);
  }
}

function assertCleanupScope(fixtures) {
  const ids = new Set(definitions.map(({ id }) => id));
  if (fixtures.some((item) => !ids.has(item.id) || !item.path.startsWith(`${FIXTURE_PREFIX}/`))) throw new Error("Fixture cleanup escaped its deterministic allowlist.");
}

function assertToolSuccess(result, operation) {
  if (!result.error && result.status === 0) return;
  const detail = String(
    result.stderr || result.error?.message || "unknown media tool error"
  ).replaceAll(process.cwd(), "<cwd>").slice(0, 300);
  throw new Error(`FFmpeg could not ${operation}: ${detail}`);
}
