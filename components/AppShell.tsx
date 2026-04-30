"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CircleAlert,
  MonitorCheck,
  Languages,
  BookOpen,
  ShieldCheck,
  ChartNoAxesCombined,
  Trophy,
  User,
  Clapperboard,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: any;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Entrenamiento", href: "/training", icon: CircleAlert },
  { label: "Modo VAR", href: "/training/var", icon: MonitorCheck },
  { label: "Modo Inglés", href: "/training/english", icon: Languages },
  { label: "Biblioteca IFAB", href: "/learning", icon: BookOpen },
  { label: "Exámenes", href: "/training/exam", icon: ShieldCheck },
  { label: "Estadísticas", href: "/stats", icon: ChartNoAxesCombined },
  { label: "Ranking", href: "/ranking", icon: Trophy },
  { label: "Admin Clips", href: "/admin-clips", icon: Clapperboard },
  { label: "Mi Perfil", href: "/profile", icon: User },
];

const mobileItems = [
  { label: "Inicio", href: "/mobile-dashboard", icon: Home },
  { label: "Train", href: "/training", icon: CircleAlert },
  { label: "VAR", href: "/mobile-var", icon: MonitorCheck },
  { label: "Stats", href: "/mobile-stats", icon: ChartNoAxesCombined },
  { label: "Perfil", href: "/profile", icon: User },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#050b12] text-white">
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-[260px] border-r border-white/10 bg-[#050b12] p-5 lg:block">
        <Logo />

        <nav className="mt-10 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href))
              }
            />
          ))}
        </nav>
      </aside>

      <header className="fixed left-0 top-0 z-50 flex h-[72px] w-full items-center justify-between border-b border-white/10 bg-[#050b12]/95 px-4 backdrop-blur">
        <Logo compact />
      </header>

      <main className="min-h-screen px-3 pb-28 pt-[88px] lg:ml-[260px] lg:px-8 lg:pb-8 lg:pt-8">
        <div className="mx-auto w-full lg:max-w-[1180px]">{children}</div>
      </main>

      <nav className="fixed bottom-0 left-0 z-50 grid h-20 w-full grid-cols-5 border-t border-white/10 bg-[#050b12]/95 px-2 pb-2 pt-2 backdrop-blur lg:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black transition ${
                active
                  ? "bg-[#6fc11f] text-black"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/home" className="flex items-center gap-3">
      <Image
        src="/logo.png"
        alt="RefLab"
        width={compact ? 40 : 44}
        height={compact ? 40 : 44}
        priority
        className="rounded-full object-cover shadow-[0_0_24px_rgba(111,193,31,0.18)]"
      />

      <div>
        <p className={`${compact ? "text-sm" : "text-lg"} font-black tracking-wide`}>
          REF<span className="text-[#6fc11f]">LAB</span>
        </p>
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} text-zinc-500`}>
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