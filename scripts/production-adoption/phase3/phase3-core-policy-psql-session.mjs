import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";

export class CorePolicySessionFailure extends Error {
  constructor(reason, { sqlstate = null, exitStatus = null } = {}) {
    super(reason); this.reason = reason;
    this.sqlstate = /^[0-9A-Z]{5}$/.test(sqlstate ?? "") ? sqlstate : null;
    this.psqlExitStatus = Number.isInteger(exitStatus) ? exitStatus : null;
  }
}
function safeProcessFailure(error, stderr, exitStatus) {
  const sqlstate = String(stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1] ?? null;
  const reason = error?.code === "ENOENT" ? "PSQL_NOT_FOUND" : error?.code === "ETIMEDOUT" || sqlstate === "57014"
    ? "TIMEOUT" : sqlstate ? `SQLSTATE_${sqlstate}` : "PSQL_SESSION_FAILED";
  return new CorePolicySessionFailure(reason, { sqlstate, exitStatus });
}

// A single psql process owns the connection for BEGIN, both observations, DDL and COMMIT.
// Dual stdout/stderr barriers prevent delayed warnings from passing a successful boundary.
export function createCorePolicyPsqlSession(connection, hostEnvironment, { binary = "psql", spawnProcess = spawn } = {}) {
  const child = spawnProcess(binary, ["-X", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
    "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose"], {
    env: { ...buildPsqlEnvironment(hostEnvironment, connection), PGCONNECT_TIMEOUT: "10" },
    windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
  });
  const nonce = randomBytes(24).toString("hex");
  let sequence = 0, pending = null, dead = false, fatal = null, stderr = "", warning = false;
  let stdoutRemainder = "", stderrRemainder = "";
  let lifetime;
  const exited = new Promise((resolve) => child.once("close", (code) => {
    clearTimeout(lifetime);
    dead = true;
    fatal ??= safeProcessFailure(null, stderr, code);
    if (pending) { clearTimeout(pending.timer); pending.reject(fatal); pending = null; }
    resolve();
  }));
  const abort = (failure) => {
    fatal = failure;
    if (pending) { clearTimeout(pending.timer); pending.reject(failure); pending = null; }
    child.kill();
  };
  lifetime = setTimeout(() => abort(new CorePolicySessionFailure("TIMEOUT")), 190000);
  child.on("error", (error) => abort(safeProcessFailure(error, stderr, null)));
  child.stdin.on("error", (error) => abort(safeProcessFailure(error, stderr, null)));
  const accept = (line, channel) => {
    if (pending && line === pending.marker) {
      pending[channel] = true;
      if (pending.stdout && pending.stderr) {
        const job = pending; pending = null; clearTimeout(job.timer);
        if (warning) job.reject(new CorePolicySessionFailure("PSQL_WARNING")); else job.resolve(job.output);
      }
    } else if (channel === "stdout" && pending) {
      pending.output += `${line}\n`;
      if (Buffer.byteLength(pending.output) > 16 * 1024 * 1024) abort(new CorePolicySessionFailure("OUTPUT_LIMIT_EXCEEDED"));
    } else if (channel === "stderr") {
      stderr = (stderr + line + "\n").slice(-16384);
      if (/WARNING:|ADVERTENCIA:/i.test(line)) warning = true;
    }
  };
  child.stdout.on("data", (data) => {
    stdoutRemainder += data.toString("utf8");
    let index;
    while ((index = stdoutRemainder.indexOf("\n")) >= 0) {
      accept(stdoutRemainder.slice(0, index).replace(/\r$/, ""), "stdout"); stdoutRemainder = stdoutRemainder.slice(index + 1);
    }
    if (stdoutRemainder.length > 16 * 1024 * 1024) abort(new CorePolicySessionFailure("OUTPUT_LIMIT_EXCEEDED"));
  });
  child.stderr.on("data", (data) => {
    stderrRemainder += data.toString("utf8");
    let index;
    while ((index = stderrRemainder.indexOf("\n")) >= 0) {
      accept(stderrRemainder.slice(0, index).replace(/\r$/, ""), "stderr"); stderrRemainder = stderrRemainder.slice(index + 1);
    }
    if (stderrRemainder.length > 16384) abort(new CorePolicySessionFailure("OUTPUT_LIMIT_EXCEEDED"));
  });
  return {
    async query(sql) {
      if (dead || fatal) throw fatal ?? new CorePolicySessionFailure("PSQL_SESSION_CLOSED");
      if (pending) throw new CorePolicySessionFailure("CONCURRENT_SESSION_QUERY_REJECTED");
      const marker = `REFLAB_64245_${nonce}_${++sequence}`;
      return new Promise((resolve, reject) => {
        pending = { marker, output: "", stdout: false, stderr: false, resolve, reject,
          timer: setTimeout(() => abort(new CorePolicySessionFailure("TIMEOUT")), 100000) };
        child.stdin.write(`${sql}\n\\echo ${marker}\n\\warn ${marker}\n`);
      });
    },
    async rollback() {
      if (!dead && !fatal) await this.query("rollback;");
      else { child.kill(); await exited; }
    },
    async close() {
      if (!dead) child.stdin.end("\\q\n");
      const timer = setTimeout(() => child.kill(), 2000);
      await exited; clearTimeout(timer);
    },
  };
}
