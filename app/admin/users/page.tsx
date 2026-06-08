"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  CalendarClock,
  Eye,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
  UserRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { roleLabels, systemRoles, type SystemRole } from "@/lib/institutionalRoles";
import { planLabels, subscriptionPlans, type SubscriptionPlan } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";

type AdminUser = {
  userId: string;
  name: string;
  fullName: string;
  email: string;
  clerkUserId: string;
  refCardId: string;
  role: SystemRole;
  roleLabel: string;
  subscriptionPlan: SubscriptionPlan;
  planLabel: string;
  institutionId: string | null;
  avatarUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type DraftState = Record<
  string,
  {
    role: SystemRole;
    subscriptionPlan: SubscriptionPlan;
  }
>;

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isSuperAdmin, loadingRole } = useUserRole();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drafts, setDrafts] = useState<DraftState>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded && !user) router.replace("/sign-in");
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSuperAdmin, loadingRole, router, user]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isSuperAdmin) return;
    void loadUsers();
  }, [isLoaded, isSuperAdmin, loadingRole, user]);

  const counts = useMemo(() => {
    return users.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.subscriptionPlan] += 1;
        acc[item.role] += 1;
        return acc;
      },
      {
        total: 0,
        free: 0,
        pro: 0,
        super_admin: 0,
        institution_admin: 0,
        institutional_instructor: 0,
        institutional_student: 0,
        individual_referee: 0,
      } as Record<SubscriptionPlan | SystemRole | "total", number>
    );
  }, [users]);

  async function loadUsers({ resetMessage = true } = {}) {
    setLoading(true);
    setError(null);
    if (resetMessage) setMessage(null);

    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = (await response.json()) as {
        users?: AdminUser[];
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(data.technical || data.error || "No se pudieron cargar los usuarios.");
      }

      const loadedUsers = data.users ?? [];
      setUsers(loadedUsers);
      setDrafts(
        loadedUsers.reduce((acc, item) => {
          acc[item.userId] = {
            role: item.role,
            subscriptionPlan: item.subscriptionPlan,
          };
          return acc;
        }, {} as DraftState)
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;

    setSavingId(userId);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          role: draft.role,
          subscriptionPlan: draft.subscriptionPlan,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        technical?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.technical || data.error || "No se pudo guardar el usuario.");
      }

      await loadUsers({ resetMessage: false });
      setMessage("Usuario actualizado correctamente.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error desconocido.");
    } finally {
      setSavingId(null);
    }
  }

  function updateDraft(
    userId: string,
    field: "role" | "subscriptionPlan",
    value: SystemRole | SubscriptionPlan
  ) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        role: current[userId]?.role ?? "individual_referee",
        subscriptionPlan: current[userId]?.subscriptionPlan ?? "free",
        [field]: value,
      },
    }));
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

  if (!user || !isSuperAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            SUPER ADMIN
          </p>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Usuarios y planes</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Cambia roles y simula la experiencia FREE o PRO con usuarios
                reales ya registrados en RefLab.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadUsers()}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a]"
            >
              <RefreshCw size={18} />
              Actualizar
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Usuarios" value={counts.total} icon={<UserCog size={22} />} />
          <Metric label="FREE" value={counts.free} icon={<ShieldCheck size={22} />} />
          <Metric label="PRO" value={counts.pro} icon={<ShieldCheck size={22} />} />
          <Metric label="Super admin" value={counts.super_admin} icon={<ShieldCheck size={22} />} />
        </section>

        {message && (
          <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-[30px] border border-white/10 bg-[#0b131b] text-zinc-400">
            <Loader2 className="mr-2 animate-spin" size={20} />
            Cargando usuarios...
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-[30px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
            Todavia no hay usuarios con perfil o rol registrado.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[#071019] shadow-2xl">
            <div className="hidden grid-cols-[minmax(220px,1.1fr)_minmax(220px,1fr)_minmax(180px,0.9fr)_180px_130px_150px_150px_220px] gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500 2xl:grid">
              <span>Nombre RefLab</span>
              <span>Email registrado</span>
              <span>Clerk User ID</span>
              <span>Rol</span>
              <span>Plan</span>
              <span>Creado</span>
              <span>Actualizado</span>
              <span>Acciones</span>
            </div>
            {users.map((item) => {
              const draft = drafts[item.userId] ?? {
                role: item.role,
                subscriptionPlan: item.subscriptionPlan,
              };
              const dirty =
                draft.role !== item.role ||
                draft.subscriptionPlan !== item.subscriptionPlan;

              return (
                <article
                  key={item.userId}
                  className="border-b border-white/10 p-4 last:border-b-0"
                >
                  <div className="grid gap-4 2xl:grid-cols-[minmax(220px,1.1fr)_minmax(220px,1fr)_minmax(180px,0.9fr)_180px_130px_150px_150px_220px] 2xl:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                          {item.avatarUrl ? (
                            <img
                              src={item.avatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <UserRound size={20} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f] 2xl:hidden">
                            Nombre RefLab
                          </p>
                          <h2 className="break-words text-xl font-black">
                            {item.name}
                          </h2>
                          {item.fullName && item.fullName !== item.name && (
                            <p className="mt-1 break-words text-xs text-zinc-500">
                              Clerk: {item.fullName}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 break-words text-xs text-zinc-500">
                        RefCard {item.refCardId}
                      </p>
                    </div>

                    <FieldBlock label="Email registrado">
                      <span className="inline-flex min-w-0 items-center gap-2 break-all text-sm font-bold text-zinc-200">
                        <Mail size={15} className="shrink-0 text-[#6fc11f]" />
                        {item.email}
                      </span>
                    </FieldBlock>

                    <FieldBlock label="Clerk User ID">
                      <span className="break-all font-mono text-xs text-zinc-400">
                        {item.clerkUserId}
                      </span>
                    </FieldBlock>

                    <div className="min-w-0">
                      <SelectField
                        label="Rol"
                        value={draft.role}
                        options={systemRoles.map((role) => ({
                          value: role,
                          label: roleLabels[role],
                        }))}
                        onChange={(value) =>
                          updateDraft(item.userId, "role", value as SystemRole)
                        }
                      />
                    </div>

                    <div className="min-w-0">
                      <SelectField
                        label="Plan"
                        value={draft.subscriptionPlan}
                        options={subscriptionPlans.map((plan) => ({
                          value: plan,
                          label: planLabels[plan],
                        }))}
                        onChange={(value) =>
                          updateDraft(
                            item.userId,
                            "subscriptionPlan",
                            value as SubscriptionPlan
                          )
                        }
                      />
                    </div>

                    <FieldBlock label="Creado">
                      <DateValue value={item.createdAt} />
                    </FieldBlock>

                    <FieldBlock label="Actualizado">
                      <DateValue value={item.updatedAt} />
                    </FieldBlock>

                    <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1 min-[1720px]:grid-cols-2">
                      <a
                        href={
                          item.refCardId === "Pendiente"
                            ? "#"
                            : `/refcard/${encodeURIComponent(item.refCardId)}`
                        }
                        aria-disabled={item.refCardId === "Pendiente"}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black text-zinc-200 transition hover:bg-white/[0.08] aria-disabled:pointer-events-none aria-disabled:opacity-45"
                      >
                        <Eye size={16} />
                        Ver usuario
                      </a>
                      <button
                        type="button"
                        onClick={() => saveUser(item.userId)}
                        disabled={!dirty || savingId === item.userId}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-xs font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {savingId === item.userId ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <Save size={16} />
                        )}
                        Guardar
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 2xl:hidden">
        {label}
      </p>
      {children}
    </div>
  );
}

function DateValue({ value }: { value: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs font-bold text-zinc-300">
      <CalendarClock size={15} className="shrink-0 text-[#6fc11f]" />
      {formatDateTime(value)}
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Pendiente";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pendiente";

  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#101b24] p-4">
      <div className="text-[#6fc11f]">{icon}</div>
      <p className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white outline-none focus:border-[#6fc11f]/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#0b131b]">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
