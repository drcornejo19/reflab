"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Loader2, RefreshCw, Save, ShieldCheck, UserCog } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { roleLabels, systemRoles, type SystemRole } from "@/lib/institutionalRoles";
import { planLabels, subscriptionPlans, type SubscriptionPlan } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";

type AdminUser = {
  userId: string;
  name: string;
  email: string;
  refCardId: string;
  role: SystemRole;
  roleLabel: string;
  subscriptionPlan: SubscriptionPlan;
  planLabel: string;
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

  async function loadUsers() {
    setLoading(true);
    setError(null);
    setMessage(null);

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

      setMessage("Usuario actualizado correctamente.");
      await loadUsers();
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
              onClick={loadUsers}
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
          <section className="grid gap-4">
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
                  className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl"
                >
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_220px_180px_140px] xl:items-end">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f]">
                        {item.refCardId}
                      </p>
                      <h2 className="mt-2 break-words text-2xl font-black">
                        {item.name}
                      </h2>
                      <p className="mt-1 break-words text-sm text-zinc-400">
                        {item.email}
                      </p>
                      <p className="mt-2 break-all text-xs text-zinc-600">
                        {item.userId}
                      </p>
                    </div>

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

                    <button
                      type="button"
                      onClick={() => saveUser(item.userId)}
                      disabled={!dirty || savingId === item.userId}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {savingId === item.userId ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <Save size={18} />
                      )}
                      Guardar
                    </button>
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
