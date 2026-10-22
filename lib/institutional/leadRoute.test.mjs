import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const files = {
  route: "app/api/institutional-leads/route.ts",
  "@/lib/institutionalEmails": "lib/institutionalEmails.ts",
  "@/lib/email": "lib/email.ts",
};
const compiled = Object.fromEntries(Object.entries(files).map(([name, path]) => [name,
  ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));
const copy = (value) => JSON.parse(JSON.stringify(value));
const body = { fullName: " Local Tester ", institutionName: " Local School ", email: "local@example.invalid" };
const successBody = {
  success: true,
  message: "Solicitud recibida. Te enviamos una confirmacion por email y nos pondremos en contacto para coordinar una demo institucional.",
  warning: null,
};
const safeLog = ["Institutional lead emailError", {
  operation: "institutional_lead_submission", stage: "email", code: "EMAIL_DELIVERY_FAILED",
}];
const password = 'local-only-p@ss/"\\\nword';
const variants = {
  raw: password,
  urlEncoded: encodeURIComponent(password),
  databaseUrl: `postgresql://fixture:${encodeURIComponent(password)}@example.invalid/db`,
  jsonEscaped: JSON.stringify({ password }),
  bearer: ["Bearer", "synthetic_token_" + "x".repeat(24)].join(" "),
  apiKey: "sb_secret_" + "local_fixture_".repeat(3),
};
function contaminated(value) {
  return { message: value, details: value, hint: value, code: value, stack: value,
    nested: { error: { credential: value } } };
}

// All transport and database boundaries are replaced. Unknown imports fail closed.
function harness(options = {}) {
  const calls = [], logs = [], cache = {};
  const env = {
    EMAIL_PROVIDER: options.provider ?? "resend", RESEND_API_KEY: variants.apiKey,
    SMTP_HOST: "smtp.example.invalid", SMTP_USER: "fixture@example.invalid",
    SMTP_PASSWORD: password, INSTITUTIONAL_EMAIL: "internal@example.invalid",
  };
  const mocks = {
    "next/server": { NextResponse: { json: (data, config) => ({ data, status: config?.status ?? 200 }) } },
    "@/lib/supabaseAdmin": { createSupabaseAdminClient: () => {
      calls.push(["admin"]);
      if (options.adminThrow) throw options.adminThrow;
      return { from: (table) => ({ insert: async (payload) => {
        calls.push(["insert", table, copy(payload)]);
        if (options.insertThrow) throw options.insertThrow;
        return { error: options.insertError ?? null };
      } }) };
    } },
    "@/lib/institutionalExperience": {
      activeInstitutionTypes: ["school", "league", "association"],
      institutionTypeLabels: { school: "School", league: "League", association: "Association" },
    },
    nodemailer: { createTransport: () => ({ sendMail: async () => {
      calls.push(["smtp"]);
      if (options.transportThrow) throw options.transportThrow;
      return { messageId: "local-message" };
    } }) },
  };
  if (!options.integrated) mocks["@/lib/institutionalEmails"] = {
    sendInstitutionalLeadEmails: async (lead) => {
      calls.push(["email", copy(lead)]);
      if (options.emailThrow) throw options.emailThrow;
      return options.emailResult ?? { internal: { ok: true }, confirmation: { ok: true } };
    },
  };
  function load(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (cache[name]) return cache[name];
    assert(Object.hasOwn(compiled, name), `Unexpected dependency: ${name}`);
    const exports = {}; cache[name] = exports;
    runInNewContext(compiled[name], {
      exports, require: load, Error, process: { env },
      console: Object.fromEntries(["error", "warn", "log"].map((level) => [level, (...args) => logs.push(args)])),
      fetch: async () => {
        calls.push(["resend"]);
        if (options.transportThrow) throw options.transportThrow;
        return { ok: !options.transportError, status: options.transportError ? 401 : 200,
          json: async () => options.transportError ?? { id: "local-message" } };
      },
    });
    return exports;
  }
  return { calls, logs, load, post: (payload = body) => load("route").POST({ json: async () => {
    if (options.jsonThrow) throw options.jsonThrow;
    return payload;
  } }) };
}
function assertSafe(result, logs) {
  const serialized = JSON.stringify({ result, logs });
  for (const value of Object.values(variants)) {
    assert(!serialized.includes(value));
    assert(!serialized.includes(JSON.stringify(value).slice(1, -1)));
  }
  function inspect(value) {
    if (typeof value === "string") {
      for (const secret of Object.values(variants)) assert(!value.includes(secret));
      let parsed;
      try { parsed = JSON.parse(value); } catch { return; }
      if (parsed !== value) inspect(parsed);
    } else if (value && typeof value === "object") {
      for (const child of Object.values(value)) inspect(child);
    }
  }
  inspect(JSON.parse(serialized));
}

for (const [name, secret] of Object.entries(variants)) {
  test(`database ${name} diagnostics never reach response/log; no false success or email`, async () => {
    const h = harness({ insertError: contaminated(secret) });
    const response = await h.post();
    assert.deepEqual(copy(response), { status: 500, data: {
      success: false, error: "No se pudo guardar la solicitud institucional en Supabase.",
    } });
    assert.deepEqual(h.calls.map(([name]) => name), ["admin", "insert"]);
    assert.deepEqual(h.logs, []); assertSafe(response, h.logs);
  });
  test(`email ${name} diagnostics never reach response/log; saved request remains successful`, async () => {
    const h = harness({ emailResult: { internal: { ok: false, ...contaminated(secret) }, confirmation: { ok: true } } });
    const response = await h.post();
    assert.deepEqual(copy(response), { status: 200, data: { ...successBody,
      warning: "La solicitud se guardo, pero hubo un problema enviando emails.",
    } });
    assert.deepEqual(h.calls.map(([name]) => name), ["admin", "insert", "email"]);
    assert.deepEqual(copy(h.logs), [safeLog]); assertSafe(response, h.logs);
  });
  test(`unexpected ${name} message/stack/nested fields are discarded`, async () => {
    const error = Object.assign(new Error(secret), contaminated(secret));
    const h = harness({ insertThrow: error }); const response = await h.post();
    assert.deepEqual(copy(response), { status: 500, data: {
      success: false, error: "No se pudo procesar la solicitud institucional.",
    } });
    assert.deepEqual(h.calls.map(([name]) => name), ["admin", "insert"]);
    assert.deepEqual(h.logs, []); assertSafe(response, h.logs);
  });
  for (const mode of ["resend-response", "resend-exception", "smtp-exception"]) {
    test(`real email helper chain discards ${name} in ${mode} before any log`, async () => {
      const h = harness({ integrated: true, provider: mode.startsWith("smtp") ? "smtp" : "resend",
        ...(mode === "resend-response" ? { transportError: contaminated(secret) }
          : { transportThrow: Object.assign(new Error(secret), contaminated(secret)) }),
      });
      const response = await h.post();
      assert.equal(response.status, 200); assert.equal(response.data.success, true);
      assert.equal(response.data.warning, "La solicitud se guardo, pero hubo un problema enviando emails.");
      assert.deepEqual(h.calls.map(([name]) => name), ["admin", "insert", mode.startsWith("smtp") ? "smtp" : "resend", mode.startsWith("smtp") ? "smtp" : "resend"]);
      assert.deepEqual(copy(h.logs), [safeLog]); assertSafe(response, h.logs);
    });
  }
}

test("validation precedes creation of the administrative client", async () => {
  for (const payload of [{}, { ...body, fullName: " " }, { ...body, institutionName: " " }, { ...body, email: "invalid" }]) {
    const h = harness(); assert.equal((await h.post(payload)).status, 400);
    assert.deepEqual(h.calls, []); assert.deepEqual(h.logs, []);
  }
});
test("success preserves exact response, explicit payload, timestamps and INSERT-before-email", async () => {
  const h = harness(); const response = await h.post({ ...body, role: " Referee ", institutionType: "school",
    country: " AR ", city: " City ", refereeCount: "12.9", instructorCount: -1, whatsapp: " 123 ",
    interestAreas: [" Training ", "", null], message: " Hello ", status: "won", owner_user_id: "ignored", created_at: "ignored" });
  assert.deepEqual(copy(response), { status: 200, data: successBody });
  assert.deepEqual(h.calls.map(([name]) => name), ["admin", "insert", "email"]);
  const [, table, payload] = h.calls[1]; assert.equal(table, "institutional_leads");
  assert.match(payload.created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(payload.created_at, payload.updated_at);
  assert.deepEqual(payload, { full_name: "Local Tester", institution_name: "Local School", email: body.email,
    role: "Referee", institution_type: "school", country: "AR", city: "City", referee_count: 12,
    instructor_count: null, whatsapp: "123", interest_areas: ["Training"], message: "Hello", status: "new",
    created_at: payload.created_at, updated_at: payload.created_at });
  assert.equal(h.calls[2][1].createdAt, payload.created_at); assert.deepEqual(h.logs, []);
});
for (const provider of ["resend", "smtp"]) test(`real ${provider} email success preserves business response`, async () => {
  const h = harness({ integrated: true, provider });
  assert.deepEqual(copy(await h.post()), { status: 200, data: successBody });
  assert.deepEqual(h.calls.map(([name]) => name), ["admin", "insert", provider, provider]);
  assert.deepEqual(h.logs, []);
});
for (const phase of ["jsonThrow", "adminThrow", "emailThrow"]) test(`${phase} stays generic without losing existing status semantics`, async () => {
  const h = harness({ [phase]: Object.assign(new Error(variants.raw), { stack: variants.databaseUrl }) });
  const response = await h.post(); assert.equal(response.status, 500); assert.equal(response.data.success, false);
  assert.equal(h.calls.filter(([name]) => name === "insert").length, phase === "emailThrow" ? 1 : 0);
  assertSafe(response, h.logs); assert.deepEqual(h.logs, []);
});
test("diagnostic getters and stringification are never evaluated", async () => {
  const poison = { toJSON() { throw new Error("Diagnostics must not be serialized"); } };
  for (const field of ["message", "details", "hint", "code", "stack", "error"]) Object.defineProperty(poison, field, {
    get() { throw new Error("Diagnostics must not be read"); },
  });
  const database = harness({ insertError: poison }); assert.equal((await database.post()).status, 500);
  const email = harness({ emailResult: { internal: Object.assign(Object.create(poison), { ok: false }), confirmation: { ok: true } } });
  assert.equal((await email.post()).status, 200); assert.deepEqual(copy(email.logs), [safeLog]);
  const integrated = harness({ integrated: true, transportError: poison });
  assert.equal((await integrated.post()).status, 200); assert.deepEqual(copy(integrated.logs), [safeLog]);
});
for (const provider of ["resend", "smtp"]) test(`other ${provider} callers retain default diagnostic behavior`, async () => {
  const benign = "benign local failure";
  const h = harness({ integrated: true, provider,
    ...(provider === "smtp" ? { transportThrow: new Error(benign) } : { transportError: { message: benign } }),
  });
  const result = await h.load("@/lib/email").sendTransactionalEmail({ to: body.email, subject: "Local", html: "Local", text: "Local" });
  assert.equal(result.ok, false); assert.equal(result.error, benign); assert.equal(h.logs.length, 1);
});
test("caller stays public and server-only; no JWT, returning SELECT or browser credential", () => {
  const route = read(files.route), helper = read("lib/supabaseAdmin.ts");
  assert.match(route, /createSupabaseAdminClient/);
  assert.doesNotMatch(route, /createClient|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY|accessToken|\.select\(|technical:/);
  assert.match(helper, /import "server-only"/);
  assert.doesNotMatch(read("components/InstitutionalLeadForm.tsx"), /supabaseAdmin|SUPABASE_SECRET_KEY|createClient/);
  assert.match(read("lib/auth/apiAuthBoundary.ts"), /classified\("\/api\/institutional-leads", "public"\)/);
});
