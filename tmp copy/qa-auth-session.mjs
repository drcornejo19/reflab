import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const env = await loadEnv(path.join(process.cwd(), ".env.local"));
  const clerk = createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  });
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const candidate = await findCandidateUserId(supabase);
  const resolved = await resolveClerkUser(clerk, candidate);
  const session = await clerk.sessions.createSession({ userId: resolved.id });
  const token = await clerk.sessions.getToken(session.id);
  const signInToken = await clerk.signInTokens.createSignInToken({
    userId: resolved.id,
    expiresInSeconds: 300,
  });
  const authSignature = crypto
    .createHmac("sha1", env.CLERK_SECRET_KEY)
    .update(token.jwt)
    .digest("hex");

  console.log(
    JSON.stringify(
      {
        source: resolved.source,
        userId: resolved.id,
        email: resolved.email,
        sessionId: session.id,
        sessionToken: token.jwt,
        authSignature,
        signInToken: signInToken.token,
        signInUrl: signInToken.url,
      },
      null,
      2
    )
  );
}

async function loadEnv(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

async function findCandidateUserId(supabase) {
  const counts = new Map();
  const tables = ["attempts", "exam_results", "rules_exam_results"];

  for (const table of tables) {
    const { data } = await supabase.from(table).select("user_id").limit(2000);
    for (const row of data ?? []) {
      const userId = typeof row.user_id === "string" ? row.user_id : "";
      if (!userId) continue;
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
  }

  if (counts.size > 0) {
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(20);

  const fallbackId = profiles?.find((row) => typeof row.user_id === "string")?.user_id;
  return fallbackId ?? null;
}

async function resolveClerkUser(clerk, preferredUserId) {
  if (preferredUserId) {
    try {
      const user = await clerk.users.getUser(preferredUserId);
      return {
        id: user.id,
        email: user.emailAddresses[0]?.emailAddress ?? null,
        source: "supabase_activity",
      };
    } catch {
      // fall through to user list
    }
  }

  const list = await clerk.users.getUserList({ limit: 10 });
  const user = list.data[0];

  if (!user) {
    throw new Error("No Clerk users available to build a QA session.");
  }

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    source: "clerk_fallback",
  };
}

await main();
