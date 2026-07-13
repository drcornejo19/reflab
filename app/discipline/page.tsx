import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DisciplineWelcomeScreen } from "@/components/DisciplineWelcomeScreen";
import {
  DISCIPLINE_COOKIE_KEY,
  normalizeDisciplineValue,
  sanitizeInternalPath,
} from "@/lib/discipline";

export const dynamic = "force-dynamic";

export default async function DisciplinePage(
  props: {
    searchParams: Promise<{
      next?: string | string[];
      force?: string | string[];
    }>;
  }
) {
  const session = await auth();

  if (!session.userId) {
    redirect("/sign-in");
  }

  const query = await props.searchParams;
  const nextPath = sanitizeInternalPath(query.next);
  const forceSelection = query.force === "1";
  const cookieStore = await cookies();
  const currentDiscipline = normalizeDisciplineValue(
    cookieStore.get(DISCIPLINE_COOKIE_KEY)?.value ?? null
  );

  if (currentDiscipline && !forceSelection && !nextPath) {
    redirect("/dashboard");
  }

  return (
    <DisciplineWelcomeScreen
      nextPath={nextPath}
      initialDiscipline={currentDiscipline}
    />
  );
}
