"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen,
  ChartNoAxesCombined,
  CircleAlert,
  Clapperboard,
  Home,
  Info,
  Menu,
  ShieldCheck,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useUserRole } from "@/lib/useUserRole";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  activePaths?: string[];
  activePrefixes?: string[];
  adminOnly?: boolean;
};

const trainingActivePaths = ["/training", "/mobile-var"];
const trainingActivePrefixes = [
  "/training/decision",
  "/training/video-analysis",
  "/training/var",
  "/training/english",
  "/training/communication",
  "/training/referee-preparation",
  "/training/field",
  "/training/rules-practice",
  "/training/rules-premium-practice",
];

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  {
    label: "Entrenamiento",
    href: "/training",
    icon: CircleAlert,
    activePaths: trainingActivePaths,
    activePrefixes: trainingActivePrefixes,
  },
  {
    label: "Evaluaciones",
    href: "/evaluations",
    icon: ShieldCheck,
    activePaths: ["/evaluations", "/training/exam", "/training/rules-exam"],
    activePrefixes: ["/evaluations"],
  },
  {
    label: "Rendimiento",
    href: "/performance",
    icon: ChartNoAxesCombined,
    activePaths: ["/performance", "/stats", "/ranking", "/mobile-stats"],
    activePrefixes: ["/performance"],
  },
  {
    label: "Biblioteca",
    href: "/learning",
    icon: BookOpen,
    activePaths: ["/learning"],
  },
  { label: "Perfil", href: "/profile", icon: User },
  {
    label: "Admin",
    href: "/admin",
    icon: Clapperboard,
    activePaths: ["/admin", "/admin-clips"],
    activePrefixes: ["/admin"],
    adminOnly: true,
  },
];

const mobileItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/mobile-dashboard",
    icon: Home,
    activePaths: ["/mobile-dashboard", "/dashboard"],
  },
  {
    label: "Entrenar",
    href: "/training",
    icon: CircleAlert,
    activePaths: trainingActivePaths,
    activePrefixes: trainingActivePrefixes,
  },
  {
    label: "Evaluar",
    href: "/evaluations",
    icon: ShieldCheck,
    activePaths: ["/evaluations", "/training/exam", "/training/rules-exam"],
    activePrefixes: ["/evaluations"],
  },
  {
    label: "Rendim.",
    href: "/performance",
    icon: ChartNoAxesCombined,
    activePaths: ["/performance", "/stats", "/ranking", "/mobile-stats"],
    activePrefixes: ["/performance"],
  },
  { label: "Perfil", href: "/profile", icon: User },
];

const secondaryMobileItems: NavItem[] = [
  {
    label: "RefLab",
    href: "/about",
    icon: Info,
    activePaths: ["/about"],
  },
  {
    label: "Biblioteca",
    href: "/learning",
    icon: BookOpen,
    activePaths: ["/learning"],
  },
  {
    label: "Admin",
    href: "/admin",
    icon: Clapperboard,
    activePaths: ["/admin", "/admin-clips"],
    activePrefixes: ["/admin"],
    adminOnly: true,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isVideoAdmin, loadingRole } = useUserRole();
  const visibleNavItems = filterAdminItems(navItems, isVideoAdmin, loadingRole);
  const visibleSecondaryItems = filterAdminItems(
    secondaryMobileItems,
    isVideoAdmin,
    loadingRole
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050b12] text-white">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] border-r border-white/10 bg-[#050b12] p-5 lg:block">
        <Logo />

        <nav className="mt-10 space-y-2" aria-label="Navegacion principal">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isItemActive(pathname, item)}
            />
          ))}
        </nav>
      </aside>

      <header className="fixed left-0 top-0 z-50 flex h-[76px] w-full items-center justify-between border-b border-white/10 bg-[#050b12]/95 px-4 backdrop-blur-xl lg:hidden">
        <Logo compact />

        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
          className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white shadow-lg transition active:scale-95"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden">
          <div className="mx-4 mt-[86px] rounded-[28px] border border-white/10 bg-[#0b131b] p-3 shadow-2xl">
            <p className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f]">
              Mas accesos
            </p>

            <div className="grid gap-2">
              {visibleSecondaryItems.map((item) => (
                <MobileMenuLink
                  key={item.href}
                  item={item}
                  active={isItemActive(pathname, item)}
                  onClick={() => setMobileMenuOpen(false)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="min-h-screen px-4 pb-[120px] pt-[92px] sm:px-5 lg:ml-[260px] lg:px-8 lg:pb-8 lg:pt-8">
        <div className="mx-auto w-full max-w-[460px] lg:max-w-[1180px]">
          {children}
        </div>
      </main>

      <nav className="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-3 right-3 z-50 grid h-[76px] grid-cols-5 rounded-[28px] border border-white/10 bg-[#071019]/96 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[22px] px-1 text-[10px] font-black leading-none transition active:scale-95 ${
                active
                  ? "bg-[#6fc11f] text-black shadow-[0_0_24px_rgba(111,193,31,0.28)]"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <Icon size={20} />
              <span className="w-full truncate text-center">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/about"
      aria-label="Abrir pagina institucional de RefLab"
      className="flex min-w-0 items-center gap-3"
    >
      <Image
        src="/logo.png"
        alt="RefLab"
        width={compact ? 42 : 46}
        height={compact ? 42 : 46}
        priority
        className="shrink-0 rounded-full object-cover shadow-[0_0_24px_rgba(111,193,31,0.18)]"
      />

      <div className="min-w-0">
        <p
          className={`${compact ? "text-sm" : "text-lg"} truncate font-black tracking-wide`}
        >
          REF<span className="text-[#6fc11f]">LAB</span>
        </p>
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} truncate text-zinc-500`}>
          Referee Decision Lab
        </p>
      </div>
    </Link>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition ${
        active
          ? "bg-[#6fc11f] text-black shadow-[0_0_28px_rgba(111,193,31,0.25)]"
          : "text-zinc-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={18} />
      {item.label}
    </Link>
  );
}

function MobileMenuLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-sm font-black transition active:scale-[0.98] ${
        active
          ? "bg-[#6fc11f] text-black"
          : "bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={20} />
      {item.label}
    </Link>
  );
}

function filterAdminItems(
  items: NavItem[],
  isVideoAdmin: boolean,
  loadingRole: boolean
) {
  return items.filter((item) => !item.adminOnly || (!loadingRole && isVideoAdmin));
}

function isItemActive(pathname: string, item: NavItem) {
  const activePaths = item.activePaths ?? [item.href];
  const activePrefixes = item.activePrefixes ?? [];

  return (
    activePaths.includes(pathname) ||
    activePrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  );
}
