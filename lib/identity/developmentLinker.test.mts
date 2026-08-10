import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER,
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  DevelopmentIdentityLinkerConfigurationError,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  assertDevelopmentIdentityLinkerEnvironment,
  executeDevelopmentIdentityLinkRoute,
  handleDevelopmentIdentityLinkRequest,
  linkDevelopmentClerkIdentity,
  type DevelopmentIdentityLinkStatus,
} from "./developmentLinker.ts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const migrationSql = readFileSync(
  resolve(
    repositoryRoot,
    "supabase",
    "migrations",
    "202607300001_clerk_identity_links.sql"
  ),
  "utf8"
);
const routeSource = readFileSync(
  resolve(
    repositoryRoot,
    "app",
    "api",
    "development",
    "identity-link",
    "route.ts"
  ),
  "utf8"
);
const resolutionMigrationSql = readFileSync(
  resolve(
    repositoryRoot,
    "supabase",
    "migrations",
    "202608030001_development_identity_resolution.sql"
  ),
  "utf8"
);
const proxySource = readFileSync(resolve(repositoryRoot, "proxy.ts"), "utf8");
const linkerSource = readFileSync(
  resolve(repositoryRoot, "lib", "identity", "developmentLinker.ts"),
  "utf8"
);
const environmentSource = readFileSync(
  resolve(repositoryRoot, "lib", "identity", "developmentIdentityEnvironment.ts"),
  "utf8"
);
const instrumentationSource = readFileSync(
  resolve(repositoryRoot, "instrumentation.ts"),
  "utf8"
);

const localDevelopmentSecret =
  "synthetic-development-linker-secret-0000000000000001";

function developmentEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    APP_ENV: "development",
    CLERK_ENV: "development",
    NODE_ENV: "development",
    SUPABASE_ENV: "development",
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-value",
    ENABLE_DEVELOPMENT_IDENTITY_LINKER: "true",
    DEVELOPMENT_IDENTITY_LINK_SECRET: localDevelopmentSecret,
    ...overrides,
  };
}

function authorizedRequest() {
  return new Request(
    "http://localhost/api/development/identity-link",
    {
      method: "POST",
      headers: {
        [DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER]:
          localDevelopmentSecret,
      },
    }
  );
}

function rpcClient(status: DevelopmentIdentityLinkStatus) {
  return {
    client: {
      async rpc(
        functionName: "link_development_clerk_identity",
        parameters: { p_external_subject: string }
      ) {
        assert.equal(functionName, "link_development_clerk_identity");
        assert.equal(parameters.p_external_subject, "user_clerk_local_a");
        return { data: status, error: null };
      },
    },
  };
}

test("the linker calls only the fixed server RPC and returns created", async () => {
  const calls: Array<{
    functionName: string;
    parameters: Record<string, string>;
  }> = [];
  const status = await linkDevelopmentClerkIdentity("user_clerk_local_a", {
    environment: developmentEnvironment(),
    createClient: () => ({
      async rpc(functionName, parameters) {
        calls.push({ functionName, parameters });
        return { data: "created", error: null };
      },
    }),
  });

  assert.equal(status, "created");
  assert.deepEqual(calls, [
    {
      functionName: "link_development_clerk_identity",
      parameters: { p_external_subject: "user_clerk_local_a" },
    },
  ]);
});

test("the linker preserves idempotent and conflict statuses", async () => {
  for (const expected of ["already_linked", "conflict"] as const) {
    const fake = rpcClient(expected);
    const status = await linkDevelopmentClerkIdentity(
      "user_clerk_local_a",
      {
        environment: developmentEnvironment(),
        createClient: () => fake.client,
      }
    );

    assert.equal(status, expected);
  }
});

test("the linker blocks non-development and production targets", () => {
  assert.throws(
    () =>
      assertDevelopmentIdentityLinkerEnvironment(
        developmentEnvironment({ APP_ENV: "production" })
      ),
    DevelopmentIdentityLinkerConfigurationError
  );
  assert.throws(
    () =>
      assertDevelopmentIdentityLinkerEnvironment(
        developmentEnvironment({
          SUPABASE_PROJECT_REF: FORBIDDEN_PRODUCTION_PROJECT_REF,
          NEXT_PUBLIC_SUPABASE_URL:
            `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
        })
      ),
    DevelopmentIdentityLinkerConfigurationError
  );
  assert.throws(
    () =>
      assertDevelopmentIdentityLinkerEnvironment(
        developmentEnvironment({ CLERK_ENV: "production" })
      ),
    DevelopmentIdentityLinkerConfigurationError
  );
  assert.throws(
    () =>
      assertDevelopmentIdentityLinkerEnvironment(
        developmentEnvironment({ NODE_ENV: "production" })
      ),
    DevelopmentIdentityLinkerConfigurationError
  );
});

test("the request handler rejects users without a Clerk session", async () => {
  const response = await handleDevelopmentIdentityLinkRequest(
    new Request("http://localhost/api/development/identity-link", {
      method: "POST",
    }),
    {
      getAuthenticatedUserId: async () => null,
      environment: developmentEnvironment(),
    }
  );

  assert.equal(response.status, 401);
});

test("the request handler is disabled without its explicit flag", async () => {
  const response = await handleDevelopmentIdentityLinkRequest(
    authorizedRequest(),
    {
      getAuthenticatedUserId: async () => "user_clerk_local_a",
      environment: developmentEnvironment({
        ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
      }),
      linkIdentity: async () => {
        throw new Error("The linker must remain disabled.");
      },
    }
  );

  assert.equal(response.status, 403);
});

test("an authenticated user needs the operational secret", async () => {
  const cases = [
    {
      request: new Request(
        "http://localhost/api/development/identity-link",
        { method: "POST" }
      ),
      environment: developmentEnvironment(),
    },
    {
      request: new Request(
        "http://localhost/api/development/identity-link",
        {
          method: "POST",
          headers: {
            [DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER]:
              "incorrect-development-secret-000000000000",
          },
        }
      ),
      environment: developmentEnvironment(),
    },
    {
      request: authorizedRequest(),
      environment: developmentEnvironment({
        DEVELOPMENT_IDENTITY_LINK_SECRET: "",
      }),
    },
  ];

  for (const currentCase of cases) {
    const response = await handleDevelopmentIdentityLinkRequest(
      currentCase.request,
      {
        getAuthenticatedUserId: async () => "user_clerk_local_a",
        environment: currentCase.environment,
        linkIdentity: async () => {
          throw new Error("Unauthorized requests must not call the RPC.");
        },
      },
    );

    assert.equal(response.status, 403);
  }
});

test("the request handler rejects production and non-local requests", async () => {
  const cases = [
    {
      request: authorizedRequest(),
      environment: developmentEnvironment({ NODE_ENV: "production" }),
    },
    {
      request: new Request(
        "https://preview.example.test/api/development/identity-link",
        {
          method: "POST",
          headers: {
            [DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER]:
              localDevelopmentSecret,
          },
        }
      ),
      environment: developmentEnvironment(),
    },
  ];

  for (const currentCase of cases) {
    const response = await handleDevelopmentIdentityLinkRequest(
      currentCase.request,
      {
        getAuthenticatedUserId: async () => "user_clerk_local_a",
        environment: currentCase.environment,
        linkIdentity: async () => {
          throw new Error("Production and remote requests must be blocked.");
        },
      }
    );

    assert.equal(response.status, 403);
  }
});

test("the request handler never accepts identity input from the browser", async () => {
  const requests = [
    new Request(
      "http://localhost/api/development/identity-link?userId=forged",
      { method: "POST" }
    ),
    new Request("http://localhost/api/development/identity-link", {
      method: "POST",
      body: JSON.stringify({ externalSubject: "forged" }),
    }),
  ];

  for (const request of requests) {
    const response = await handleDevelopmentIdentityLinkRequest(request, {
      getAuthenticatedUserId: async () => "user_clerk_local_a",
      environment: developmentEnvironment(),
    });
    assert.equal(response.status, 400);
  }
});

test("the request handler maps valid RPC states to HTTP status codes", async () => {
  const expectedCodes = {
    created: 201,
    already_linked: 200,
    conflict: 409,
  } as const;

  for (const [linkStatus, expectedStatus] of Object.entries(
    expectedCodes
  ) as Array<[DevelopmentIdentityLinkStatus, number]>) {
    const response = await handleDevelopmentIdentityLinkRequest(
      authorizedRequest(),
      {
        getAuthenticatedUserId: async () => "user_clerk_local_a",
        linkIdentity: async () => linkStatus,
        environment: developmentEnvironment(),
      }
    );

    assert.equal(response.status, expectedStatus);
    assert.deepEqual(response.body, { status: linkStatus });
  }
});

test("the route executor calls the identity service exactly once without self-proxying", async () => {
  let serviceCalls = 0;
  const response = await executeDevelopmentIdentityLinkRoute(
    authorizedRequest(),
    {
      getAuthenticatedUserId: async () => "user_clerk_local_a",
      environment: developmentEnvironment(),
      linkIdentity: async (externalSubject) => {
        serviceCalls += 1;
        assert.equal(externalSubject, "user_clerk_local_a");
        return "created";
      },
    }
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "created" });
  assert.equal(serviceCalls, 1);
});

test("the identity endpoint remains independent from access provisioning", () => {
  assert.doesNotMatch(
    routeSource,
    /loadAccessSnapshot|ensureCanonicalAccessRecords|user_global_roles|user_subscriptions/
  );
});

test("the route executor rejects requests before reaching the service", async () => {
  const cases = [
    {
      request: authorizedRequest(),
      userId: null,
      environment: developmentEnvironment(),
      expectedStatus: 401,
    },
    {
      request: authorizedRequest(),
      userId: "user_clerk_local_a",
      environment: developmentEnvironment({
        ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
      }),
      expectedStatus: 403,
    },
    {
      request: new Request(
        "http://localhost/api/development/identity-link",
        {
          method: "POST",
          headers: {
            [DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER]:
              "incorrect-development-secret-000000000000",
          },
        }
      ),
      userId: "user_clerk_local_a",
      environment: developmentEnvironment(),
      expectedStatus: 403,
    },
    {
      request: authorizedRequest(),
      userId: "user_clerk_local_a",
      environment: developmentEnvironment({ NODE_ENV: "production" }),
      expectedStatus: 403,
    },
  ];

  for (const currentCase of cases) {
    let serviceCalls = 0;
    const response = await executeDevelopmentIdentityLinkRoute(
      currentCase.request,
      {
        getAuthenticatedUserId: async () => currentCase.userId,
        environment: currentCase.environment,
        linkIdentity: async () => {
          serviceCalls += 1;
          return "created";
        },
      }
    );

    assert.equal(response.status, currentCase.expectedStatus);
    assert.equal(serviceCalls, 0);
  }
});

test("the route derives identity exclusively from Clerk auth", () => {
  assert.match(routeSource, /await auth\(\)/);
  assert.match(routeSource, /return session\.userId/);
  assert.doesNotMatch(
    routeSource,
    /request\.(?:json|formData)\(\)|searchParams\.get\(/i
  );
  assert.doesNotMatch(
    routeSource,
    /SUPABASE_SERVICE_ROLE_KEY|console\.(?:log|error|warn)/i
  );
  assert.match(routeSource, /executeDevelopmentIdentityLinkRoute/);
  assert.doesNotMatch(
    routeSource,
    /\bfetch\s*\(|localhost:3000|127\.0\.0\.1:3000|NextResponse\.rewrite/i
  );
});

test("Clerk protects the identity route without a same-origin proxy", () => {
  assert.match(proxySource, /\/api\/development\/identity-link/);
  assert.match(proxySource, /isDevelopmentIdentityLinkRoute\(req\)/);
  assert.match(proxySource, /\"\/\(api\|trpc\)\(\.\*\)\"/);
  assert.doesNotMatch(
    proxySource,
    /\bfetch\s*\(|NextResponse\.(?:rewrite|redirect)|localhost:3000|127\.0\.0\.1:3000/i
  );
});

test("the migration creates a private, provider-scoped identity map", () => {
  assert.match(
    migrationSql,
    /create table reflab_private\.user_identity_links\s*\(/i
  );
  assert.match(
    migrationSql,
    /primary key \(provider, external_subject\)/i
  );
  assert.match(
    migrationSql,
    /unique \(provider, user_id\)/i
  );
  assert.match(
    migrationSql,
    /references public\.user_profiles \(user_id\)/i
  );
  assert.match(
    migrationSql,
    /check \(provider = 'clerk'\)/i
  );
  assert.match(
    migrationSql,
    /char_length\(external_subject\) between 1 and 255/i
  );
  assert.match(
    migrationSql,
    /alter table reflab_private\.user_identity_links force row level security;/i
  );
  assert.doesNotMatch(
    migrationSql,
    /external_subject\s*~\s*['"][^'"]+['"]/i
  );
});

test("the private map and RPC are not available to browser roles", () => {
  assert.match(
    migrationSql,
    /revoke all on table reflab_private\.user_identity_links\s+from public, anon, authenticated, service_role;/i
  );
  assert.match(
    migrationSql,
    /revoke all on function public\.link_development_clerk_identity\(text\)\s+from public, anon, authenticated;/i
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.link_development_clerk_identity\(text\)\s+to service_role;/i
  );
  assert.doesNotMatch(
    migrationSql,
    /grant\s+(?:select|insert|update|delete|all)\s+on\s+table\s+reflab_private\.user_identity_links\s+to\s+(?:public|anon|authenticated|service_role)/i
  );
});

test("the server identity resolver is read-only and service-role only", () => {
  const resolver = resolutionMigrationSql.match(
    /create function public\.resolve_development_clerk_identity\([\s\S]*?\$function\$;/i
  )?.[0];

  assert.ok(resolver);
  assert.match(resolver, /stable/i);
  assert.match(resolver, /security definer/i);
  assert.match(resolver, /set search_path = pg_catalog/i);
  assert.match(resolver, /reflab_private\.user_identity_links/i);
  assert.match(resolver, /environment = 'development'/i);
  assert.doesNotMatch(
    resolver,
    /\binsert\b|\bupdate\b|\bdelete\b|\bauth\.jwt\(|execute\s+format/i
  );
  assert.match(
    resolutionMigrationSql,
    /grant create on schema public to reflab_rls_owner;\s+alter function public\.resolve_development_clerk_identity\(text\)\s+owner to reflab_rls_owner;\s+revoke create on schema public from reflab_rls_owner;/i
  );
  assert.equal(
    resolutionMigrationSql.match(
      /grant create on schema public to reflab_rls_owner;/gi
    )?.length,
    1
  );
  assert.equal(
    resolutionMigrationSql.match(
      /revoke create on schema public from reflab_rls_owner;/gi
    )?.length,
    1
  );
  assert.match(
    resolutionMigrationSql,
    /revoke all on function\s+public\.resolve_development_clerk_identity\(text\)\s+from public, anon, authenticated;/i
  );
  assert.match(
    resolutionMigrationSql,
    /grant execute on function\s+public\.resolve_development_clerk_identity\(text\)\s+to service_role;/i
  );
  assert.doesNotMatch(
    resolutionMigrationSql,
    /\b(?:create|alter)\s+role\b|\bgrant\s+reflab_[a-z0-9_]+\s+to\s+[a-z0-9_]+/i
  );
});

test("the migration reuses only the canonical RLS owner", () => {
  assert.doesNotMatch(
    migrationSql,
    /\b(?:create|alter)\s+role\b|\bgrant\s+reflab_[a-z0-9_]+\s+to\s+[a-z0-9_]+/i
  );
  assert.doesNotMatch(
    migrationSql,
    /reflab_identity_linker_owner/i
  );
  assert.match(
    migrationSql,
    /alter table reflab_private\.user_identity_links owner to reflab_rls_owner;/i
  );
  assert.match(
    migrationSql,
    /alter function reflab_private\.request_user_id\(\)\s+owner to reflab_rls_owner;/i
  );
  assert.match(
    migrationSql,
    /alter function public\.link_development_clerk_identity\(text\)\s+owner to reflab_rls_owner;/i
  );
});

test("the migration adds exactly five least-privilege policies", () => {
  const policyNames = Array.from(
    migrationSql.matchAll(/create policy\s+([a-z0-9_]+)/gi),
    (match) => match[1]
  );

  assert.deepEqual(policyNames, [
    "user_identity_links_rls_owner_read",
    "user_identity_links_rls_owner_insert",
    "reflab_schema_state_identity_rls_owner_read",
    "user_profiles_identity_rls_owner_read",
    "user_subscriptions_identity_rls_owner_read",
  ]);
});

test("request_user_id resolves links and preserves the unlinked subject", () => {
  const helper = migrationSql.match(
    /create or replace function reflab_private\.request_user_id\(\)[\s\S]*?\$function\$;/i
  )?.[0];

  assert.ok(helper);
  assert.match(helper, /security definer/i);
  assert.match(helper, /set search_path = pg_catalog/i);
  assert.match(
    helper,
    /current_setting\(\s*'request\.jwt\.claims'\s*,\s*true\s*\)/i
  );
  assert.match(
    helper,
    /join reflab_private\.user_identity_links identity_link/i
  );
  assert.match(
    helper,
    /coalesce\([\s\S]*resolved_identity\.user_id[\s\S]*request_subject\.external_subject/i
  );
  assert.doesNotMatch(helper, /auth\.jwt\(|execute\s+format/i);
});

test("the RPC fixes the synthetic target and exposes only safe states", () => {
  const rpc = migrationSql.match(
    /create function public\.link_development_clerk_identity\([\s\S]*?\$function\$;/i
  )?.[0];

  assert.ok(rpc);
  assert.match(rpc, /target_user_id constant text := 'user_dev_referee_a'/i);
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /set search_path = pg_catalog/i);
  assert.match(rpc, /installation_status = 'installed'/i);
  assert.match(rpc, /environment = 'development'/i);
  assert.match(rpc, /'created'/i);
  assert.match(rpc, /'already_linked'/i);
  assert.match(rpc, /'conflict'/i);
  assert.doesNotMatch(rpc, /execute\s+format|return\s+p_external_subject/i);
});

test("the RPC uses only the canonical RLS owner", () => {
  assert.match(
    migrationSql,
    /alter function public\.link_development_clerk_identity\(text\)\s+owner to reflab_rls_owner;/i
  );
  assert.match(
    migrationSql,
    /revoke create on schema public from reflab_rls_owner;/i
  );
});

test("the application guard uses a constant-time secret comparison", () => {
  assert.match(linkerSource, /timingSafeEqual/);
  assert.match(linkerSource, /ENABLE_DEVELOPMENT_IDENTITY_LINKER/);
  assert.match(linkerSource, /DEVELOPMENT_IDENTITY_LINK_SECRET/);
  assert.match(linkerSource, /NODE_ENV/);
  assert.match(linkerSource, /LOOPBACK_HOSTNAMES/);
  assert.doesNotMatch(linkerSource, /console\.(?:log|error|warn)/i);
});

test("the Development linker remains an explicit server-only boundary", () => {
  assert.match(linkerSource, /^import "server-only";/);
  assert.match(linkerSource, /from "node:crypto"/);
  assert.match(linkerSource, /createSupabaseAdminClient/);
  assert.match(linkerSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(linkerSource, /DEVELOPMENT_IDENTITY_LINK_SECRET/);
  assert.doesNotMatch(instrumentationSource, /developmentLinker/);
});

test("the shared identity environment guard is client-safe and pure", () => {
  assert.doesNotMatch(environmentSource, /(?:from|import\s*)\s*["']node:/);
  assert.doesNotMatch(environmentSource, /@clerk\/nextjs\/server/);
  assert.doesNotMatch(environmentSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(environmentSource, /DEVELOPMENT_IDENTITY_LINK_SECRET/);
  assert.doesNotMatch(environmentSource, /process\.env/);
});

test("client entrypoints cannot reach server-only identity or node modules", () => {
  const sourceFiles = collectSourceFiles(repositoryRoot);
  const clientRoots = sourceFiles.filter((path) => isClientModule(path));
  const visited = new Set<string>();
  const pending = [...clientRoots];
  const nodeImports: Array<{ importer: string; specifier: string }> = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const specifier of importedRuntimeSpecifiers(current)) {
      if (specifier.startsWith("node:")) {
        nodeImports.push({ importer: current, specifier });
        continue;
      }

      const resolvedImport = resolveSourceImport(current, specifier);
      if (resolvedImport && !visited.has(resolvedImport)) {
        pending.push(resolvedImport);
      }
    }
  }

  const linkerPath = resolve(
    repositoryRoot,
    "lib",
    "identity",
    "developmentLinker.ts"
  );
  assert.equal(visited.has(linkerPath), false);
  assert.deepEqual(nodeImports, []);
});

function collectSourceFiles(root: string) {
  const result: string[] = [];
  const pending = [resolve(root, "app"), resolve(root, "components"), resolve(root, "lib")];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (
        /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)
      ) {
        result.push(entryPath);
      }
    }
  }

  return result;
}

function isClientModule(path: string) {
  const source = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const firstStatement = sourceFile.statements[0];
  return Boolean(
    firstStatement &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isStringLiteral(firstStatement.expression) &&
      firstStatement.expression.text === "use client"
  );
}

function importedRuntimeSpecifiers(path: string) {
  const source = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const specifiers: string[] = [];

  sourceFile.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      !node.importClause?.isTypeOnly &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });

  return specifiers;
}

function resolveSourceImport(importer: string, specifier: string) {
  let basePath: string;
  if (specifier.startsWith("@/")) {
    basePath = resolve(repositoryRoot, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = resolve(dirname(importer), specifier);
  } else {
    return null;
  }

  const withoutTypeScriptExtension = basePath.replace(/\.(?:[cm]?[jt]sx?)$/, "");
  const candidates = [
    ...[".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"].map(
      (extension) => `${withoutTypeScriptExtension}${extension}`
    ),
    ...[".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx"].map(
      (extension) => join(basePath, `index${extension}`)
    ),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
