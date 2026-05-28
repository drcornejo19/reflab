"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Building2,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  institutionTypeLabels,
  type InstitutionType,
} from "@/lib/institutionalExperience";
import { useUserRole } from "@/lib/useUserRole";

type InstitutionalLead = {
  id: string;
  full_name: string;
  role: string | null;
  institution_name: string;
  institution_type: string | null;
  country: string | null;
  city: string | null;
  referee_count: number | null;
  instructor_count: number | null;
  email: string;
  whatsapp: string | null;
  interest_areas: string[] | null;
  message: string | null;
  status: LeadStatus;
  created_at: string;
};

type LeadStatus =
  | "new"
  | "contacted"
  | "demo_scheduled"
  | "pilot"
  | "converted"
  | "rejected";

const statusLabels: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  demo_scheduled: "Demo agendada",
  pilot: "Piloto",
  converted: "Convertido",
  rejected: "Rechazado",
};

const statusOptions = Object.keys(statusLabels) as LeadStatus[];

export default function InstitutionalLeadsAdminPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();
  const [leads, setLeads] = useState<InstitutionalLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) router.replace("/sign-in");
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isVideoAdmin, loadingRole, router, user]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isVideoAdmin) return;
    void loadLeads();
  }, [isLoaded, isVideoAdmin, loadingRole, user]);

  const counts = useMemo(() => {
    return leads.reduce(
      (acc, lead) => {
        acc.total += 1;
        acc[lead.status] += 1;
        return acc;
      },
      {
        total: 0,
        new: 0,
        contacted: 0,
        demo_scheduled: 0,
        pilot: 0,
        converted: 0,
        rejected: 0,
      } as Record<LeadStatus | "total", number>
    );
  }, [leads]);

  async function loadLeads() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/institutional-leads", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        leads?: InstitutionalLead[];
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(data.technical || data.error || "No se pudieron cargar los leads.");
      }

      setLeads(data.leads ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: LeadStatus) {
    setSavingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/institutional-leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = (await response.json()) as {
        lead?: InstitutionalLead;
        error?: string;
        technical?: string;
      };

      if (!response.ok || !data.lead) {
        throw new Error(data.technical || data.error || "No se pudo actualizar el lead.");
      }

      setLeads((current) =>
        current.map((lead) => (lead.id === id ? data.lead! : lead))
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error desconocido.");
    } finally {
      setSavingId(null);
    }
  }

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user || !isVideoAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB B2B
          </p>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Leads institucionales</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Solicitudes de demo, contactos comerciales y avance del embudo institucional.
              </p>
            </div>
            <button
              type="button"
              onClick={loadLeads}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
            >
              <RefreshCw size={18} />
              Actualizar
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total" value={counts.total} />
          <Metric label="Nuevos" value={counts.new} />
          <Metric label="Demo agendada" value={counts.demo_scheduled} />
          <Metric label="Convertidos" value={counts.converted} />
        </section>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-[30px] border border-white/10 bg-[#0b131b] text-zinc-400">
            <Loader2 className="mr-2 animate-spin" size={20} />
            Cargando leads...
          </div>
        ) : leads.length === 0 ? (
          <div className="rounded-[30px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
            Todavia no hay solicitudes institucionales.
          </div>
        ) : (
          <section className="grid gap-4">
            {leads.map((lead) => (
              <article
                key={lead.id}
                className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6"
              >
                <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                      {formatInstitutionType(lead.institution_type)}
                    </p>
                    <h2 className="mt-2 break-words text-2xl font-black">
                      {lead.institution_name}
                    </h2>
                    <p className="mt-2 break-words text-sm font-semibold text-zinc-300">
                      {lead.full_name}
                      {lead.role ? ` - ${lead.role}` : ""}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-400">
                      <Badge icon={Building2} text={`${lead.city || "Ciudad s/d"} / ${lead.country || "Pais s/d"}`} />
                      <Badge icon={Mail} text={lead.email} />
                      {lead.whatsapp ? <Badge icon={MessageCircle} text={lead.whatsapp} /> : null}
                    </div>
                  </div>

                  <div className="min-w-[220px]">
                    <label className="grid gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
                        Estado comercial
                      </span>
                      <select
                        value={lead.status}
                        disabled={savingId === lead.id}
                        onChange={(event) =>
                          updateStatus(lead.id, event.target.value as LeadStatus)
                        }
                        className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white outline-none focus:border-[#6fc11f]/50 disabled:opacity-50"
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status} className="bg-[#0b131b]">
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Info label="Arbitros" value={lead.referee_count ?? "s/d"} />
                  <Info label="Instructores" value={lead.instructor_count ?? "s/d"} />
                  <Info label="Fecha" value={formatDate(lead.created_at)} />
                  <Info label="Intereses" value={(lead.interest_areas ?? []).join(", ") || "s/d"} />
                </div>

                {lead.message && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm leading-6 text-zinc-300">
                    {lead.message}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black text-[#6fc11f]">{value}</p>
    </div>
  );
}

function Badge({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <span className="inline-flex min-h-8 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3">
      <Icon className="shrink-0 text-[#6fc11f]" size={14} />
      <span className="truncate">{text}</span>
    </span>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-black text-white">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatInstitutionType(value: string | null) {
  if (
    value === "school" ||
    value === "league" ||
    value === "association" ||
    value === "federation"
  ) {
    return institutionTypeLabels[value as InstitutionType];
  }

  return value || "Institucion";
}
