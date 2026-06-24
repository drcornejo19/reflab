"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  BookOpen,
  Brain,
  Building2,
  ChevronRight,
  Clapperboard,
  BellRing,
  Settings,
  ShieldCheck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useUserRole } from "@/lib/useUserRole";

type AdminArea = {
  title: string;
  category: string;
  description: string;
  status: "Disponible" | "Proximamente";
  href?: string;
  icon: LucideIcon;
};

const adminAreas: AdminArea[] = [
  {
    title: "Clips",
    category: "Contenido",
    description:
      "Gestiona clips, URLs de video, criterios correctos, edicion y eliminacion.",
    status: "Disponible",
    href: "/admin-clips",
    icon: Clapperboard,
  },
  {
    title: "Usuarios",
    category: "Roles y planes",
    description:
      "Gestiona usuarios, roles y planes FREE/PRO para probar la experiencia completa.",
    status: "Disponible",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Leads institucionales",
    category: "Institucional",
    description:
      "Seguimiento comercial de solicitudes institucionales, demos y pilotos.",
    status: "Disponible",
    href: "/admin/institutional-leads",
    icon: Building2,
  },
  {
    title: "Clips institucionales",
    category: "Institucional",
    description:
      "Revision tecnica de videos cargados por escuelas, ligas y asociaciones.",
    status: "Disponible",
    href: "/admin/institutional-clips",
    icon: Video,
  },
  {
    title: "Notificaciones",
    category: "Comunicacion",
    description:
      "Envia avisos globales utiles sobre contenido, reglas, examenes o novedades.",
    status: "Disponible",
    href: "/admin/notifications",
    icon: BellRing,
  },
  {
    title: "Biblioteca IFAB",
    category: "Recursos",
    description:
      "Carga documentos oficiales, circulares, resumenes, vigencias y material IFAB.",
    status: "Disponible",
    href: "/admin/library",
    icon: BookOpen,
  },
  {
    title: "Psicologia arbitral",
    category: "Preparacion Integral",
    description:
      "Ordena registros por modulitos, revisa categorias y corrige contenidos sin clasificar.",
    status: "Disponible",
    href: "/admin/psychology",
    icon: Brain,
  },
  {
    title: "Evaluaciones",
    category: "Examenes",
    description:
      "Configuracion futura de simulaciones, rubricas, tiempos y feedback final.",
    status: "Proximamente",
    icon: ShieldCheck,
  },
  {
    title: "Configuracion",
    category: "Plataforma",
    description:
      "Ajustes futuros de modulos, estados, etiquetas y comportamiento general.",
    status: "Proximamente",
    icon: Settings,
  },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace("/sign-in");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isLoaded, user, isVideoAdmin, router]);

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user) return null;

  if (!isVideoAdmin) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          No tenes permisos para acceder a Admin.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-7 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-[#6fc11f]">
            REFLAB ADMIN
          </p>

          <h1 className="mt-5 text-4xl font-black md:text-5xl">Admin</h1>

          <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-400">
            Gestiona clips, usuarios, contenidos institucionales y recursos de
            la plataforma.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {adminAreas.map((area) => (
            <AdminCard key={area.title} area={area} />
          ))}
        </section>
      </div>
    </AppShell>
  );
}

function AdminCard({ area }: { area: AdminArea }) {
  const Icon = area.icon;
  const content = (
    <>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={30} />
          </div>

          <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">
            {area.status}
          </span>
        </div>

        <p className="mt-6 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          {area.category}
        </p>

        <h2 className="mt-3 text-2xl font-black">{area.title}</h2>

        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {area.description}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          {area.href ? "Abrir" : "Proximamente"}
        </span>
        <ChevronRight
          className={`text-zinc-600 transition ${
            area.href ? "group-hover:translate-x-1 group-hover:text-[#6fc11f]" : ""
          }`}
        />
      </div>
    </>
  );

  if (!area.href) {
    return (
      <div className="flex min-h-[250px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 opacity-80 shadow-2xl">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={area.href}
      className="group flex min-h-[250px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-6 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]"
    >
      {content}
    </Link>
  );
}
