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
  { label: "Biblioteca IFAB", href: "/ifab", icon: BookOpen },
  { label: "Exámenes", href: "/exam", icon: ShieldCheck },
  { label: "Estadísticas", href: "/stats", icon: ChartNoAxesCombined },
  { label: "Ranking", href: "/ranking", icon: Trophy },

  // 🔥 ESTE ES EL QUE TE FALTABA
  { label: "Admin Clips", href: "/admin-clips", icon: Clapperboard },

  { label: "Mi Perfil", href: "/profile", icon: User },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-[#050b12] text-white">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-white/10 bg-[#050b12] p-5">
        {/* LOGO */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6fc11f] font-black text-black">
            RF
          </div>
          <div>
            <p className="text-lg font-black tracking-wide">
              REF<span className="text-[#6fc11f]">LAB</span>
            </p>
            <p className="text-[10px] text-zinc-400">
              Referee Decision Lab
            </p>
          </div>
        </div>

        {/* NAV */}
        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition ${
                  isActive
                    ? "bg-[#6fc11f] text-black"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* MAIN */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}