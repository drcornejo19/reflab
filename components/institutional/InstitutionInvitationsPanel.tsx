"use client";

import { Check, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";

type PendingInvitation = {
  id: string;
  institutionId: string;
  institutionName: string;
  primarySport: string | null;
  category: string | null;
  invitedAt: string | null;
};

type InstitutionInvitationsPanelProps = {
  accent: string;
  onAccepted: (institutionId: string) => Promise<void>;
};

export function InstitutionInvitationsPanel({
  accent,
  onAccepted,
}: InstitutionInvitationsPanelProps) {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInvitations() {
      try {
        const response = await fetch("/api/institution/invitations", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          invitations?: PendingInvitation[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.invitations)) {
          throw new Error(
            payload.error || "No se pudieron cargar las invitaciones."
          );
        }
        setInvitations(payload.invitations);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudieron cargar las invitaciones."
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadInvitations();
    return () => controller.abort();
  }, []);

  async function acceptInvitation(invitation: PendingInvitation) {
    setAcceptingId(invitation.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/invitations/${encodeURIComponent(invitation.id)}/accept`,
        { method: "POST" }
      );
      const payload = (await response.json()) as {
        status?: "accepted" | "already_accepted";
        institutionId?: string;
        error?: string;
      };
      if (
        !response.ok ||
        (payload.status !== "accepted" &&
          payload.status !== "already_accepted") ||
        typeof payload.institutionId !== "string"
      ) {
        throw new Error(payload.error || "No se pudo aceptar la invitacion.");
      }

      setInvitations((current) =>
        current.filter((item) => item.id !== invitation.id)
      );
      await onAccepted(payload.institutionId);
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "No se pudo aceptar la invitacion."
      );
    } finally {
      setAcceptingId(null);
    }
  }

  if (!loading && invitations.length === 0 && !error) return null;

  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a131c] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border"
          style={{ borderColor: `${accent}55`, color: accent }}
        >
          <MailCheck size={20} />
        </span>
        <div>
          <p
            className="text-[10px] font-black uppercase tracking-[0.24em]"
            style={{ color: accent }}
          >
            Acceso pendiente
          </p>
          <h2 className="mt-2 text-xl font-black">Invitaciones pendientes</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            La membresia se activa solamente cuando elegis aceptarla.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 h-24 animate-pulse rounded-[22px] bg-white/[0.035]" />
      ) : null}

      {error ? (
        <p className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-200">
          {error}
        </p>
      ) : null}

      {invitations.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {invitations.map((invitation) => (
            <article
              key={invitation.id}
              className="flex flex-col gap-4 rounded-[22px] border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">
                  {invitation.institutionName}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {[formatSport(invitation.primarySport), invitation.category]
                    .filter(Boolean)
                    .join(" · ") || "Membresia institucional"}
                </p>
              </div>
              <button
                type="button"
                disabled={acceptingId !== null}
                onClick={() => void acceptInvitation(invitation)}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: accent, color: "#04100a" }}
              >
                <Check size={17} />
                {acceptingId === invitation.id ? "Aceptando..." : "Aceptar"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function formatSport(value: string | null) {
  if (value === "football_11") return "Futbol 11";
  if (value === "futsal") return "Futsal";
  return null;
}
