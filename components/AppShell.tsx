"use client";

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
  { label: "Inicio", href: "/dashboard", icon: Home },
  { label: "Train", href: "/training", icon: CircleAlert },
  { label: "VAR", href: "/training/var", icon: MonitorCheck },
  { label: "Stats", href: "/stats", icon: ChartNoAxesCombined },
  { label: "Perfil", href: "/profile", icon: User },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#050b12] text-white">
      {/* DESKTOP SIDEBAR */}
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

      {/* MOBILE TOPBAR */}
      <header className="fixed left-0 top-0 z-40 flex h-16 w-full items-center justify-between border-b border-white/10 bg-[#050b12]/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#6fc11f] text-sm font-black text-black">
            RF
          </div>

          <div>
            <p className="text-sm font-black tracking-wide">
              REF<span className="text-[#6fc11f]">LAB</span>
            </p>
            <p className="text-[9px] text-zinc-500">Referee Decision Lab</p>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="min-h-screen px-4 pb-28 pt-20 lg:ml-[260px] lg:px-8 lg:pb-8 lg:pt-8">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>

      {/* MOBILE BOTTOM NAV */}
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

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-[#6fc11f] font-black text-black">
        RF
      </div>

      <div>
        <p className="text-lg font-black tracking-wide">
          REF<span className="text-[#6fc11f]">LAB</span>
        </p>
        <p className="text-[10px] text-zinc-500">Referee Decision Lab</p>
      </div>
    </div>
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