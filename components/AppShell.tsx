"use client";

import Image from "next/image";
import { RF_LOGO_SIZE } from "@/lib/brand";
import { PushDeviceSync } from "@/components/PushDeviceSync";
import { DisciplineHeaderSwitch } from "@/components/DisciplineHeaderSwitch";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Activity,
  Bell,
  CircleAlert,
  Clapperboard,
  GraduationCap,
  Home,
  Info,
  Landmark,
  Languages,
  Menu,
  NotebookTabs,
  ShieldCheck,
  LifeBuoy,
  Settings,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  languageOptions,
  getStoredLanguage,
  setStoredLanguage,
  subscribeToLanguageChange,
  translate,
  type AppLanguage,
  type TranslationKey,
} from "@/lib/languagePreference";
import { useDiscipline } from "@/components/DisciplineProvider";
import { getDisciplineDefinition, getDisciplineRoute } from "@/lib/discipline";
import { useUserRole } from "@/lib/useUserRole";

type NavItem = {
  label: string;
  labelKey?: TranslationKey;
  href: string;
  icon: LucideIcon;
  activePaths?: string[];
  activePrefixes?: string[];
  adminOnly?: boolean;
  individualOnly?: boolean;
  institutionalStudentOnly?: boolean;
};

const trainingActivePaths = [
  "/training",
  "/mobile-var",
  "/futsal/rules-practice",
];
const trainingActivePrefixes = [
  "/training/decision",
  "/training/var",
  "/training/english",
  "/training/communication",
  "/training/field",
  "/training/referee-preparation",
  "/training/psychology",
  "/training/rules-practice",
  "/training/rules-premium-practice",
  "/futsal/rules-practice",
];
const evaluationsActivePaths = [
  "/evaluations",
  "/training/exam",
  "/training/rules-exam",
  "/training/video-analysis",
  "/futsal/video-analysis",
  "/futsal/rules-exam",
];
const evaluationsActivePrefixes = [
  "/evaluations",
  "/training/video-analysis",
  "/futsal/video-analysis",
  "/futsal/rules-exam",
];
const matchesActivePaths = ["/matches"];
const matchesActivePrefixes = ["/matches"];

function getDesktopNavItems(trainingHref: string, evaluationsHref: string) {
  return [
    {
      label: "Mi Programa",
      href: "/demo/student",
      icon: GraduationCap,
      activePaths: ["/demo/student"],
      institutionalStudentOnly: true,
    },
    {
      label: "Reglas",
      href: "/institution/rules",
      icon: BookOpen,
      activePaths: ["/institution/rules"],
      activePrefixes: ["/institution/rules"],
      institutionalStudentOnly: true,
    },
    {
      label: "Dashboard",
      labelKey: "nav.dashboard",
      href: "/dashboard",
      icon: Home,
      individualOnly: true,
    },
    {
      label: "Entrenamiento",
      labelKey: "nav.training",
      href: trainingHref,
      icon: CircleAlert,
      activePaths: trainingActivePaths,
      activePrefixes: trainingActivePrefixes,
      individualOnly: true,
    },
    {
      label: "Evaluaciones",
      labelKey: "nav.evaluations",
      href: evaluationsHref,
      icon: ShieldCheck,
      activePaths: evaluationsActivePaths,
      activePrefixes: evaluationsActivePrefixes,
    },
    {
      label: "Mis partidos",
      labelKey: "nav.matches",
      href: "/matches",
      icon: NotebookTabs,
      activePaths: matchesActivePaths,
      activePrefixes: matchesActivePrefixes,
    },
    {
      label: "Ref Performance",
      labelKey: "nav.performance",
      href: "/performance",
      icon: Activity,
      activePaths: ["/performance", "/stats", "/ranking", "/mobile-stats"],
      activePrefixes: ["/performance"],
      individualOnly: true,
    },
    {
      label: "Biblioteca",
      labelKey: "nav.library",
      href: "/learning",
      icon: BookOpen,
      activePaths: ["/learning"],
    },
    {
      label: "Instituciones",
      labelKey: "nav.institutions",
      href: "/institutional",
      icon: Landmark,
      activePaths: ["/institutional"],
    },
    {
      label: "Perfil",
      labelKey: "nav.profile",
      href: "/profile",
      icon: User,
      individualOnly: true,
    },
    {
      label: "Notificaciones",
      labelKey: "nav.notifications",
      href: "/notifications",
      icon: Bell,
      activePaths: ["/notifications"],
    },
    {
      label: "Soporte",
      labelKey: "nav.support",
      href: "/support",
      icon: LifeBuoy,
      activePaths: ["/support"],
    },
    {
      label: "Admin",
      labelKey: "nav.admin",
      href: "/admin",
      icon: Clapperboard,
      activePaths: ["/admin", "/admin-clips"],
      activePrefixes: ["/admin"],
      adminOnly: true,
    },
  ] satisfies NavItem[];
}

function getPrimaryMobileItems(trainingHref: string, evaluationsHref: string) {
  return [
    {
      label: "Programa",
      href: "/demo/student",
      icon: GraduationCap,
      activePaths: ["/demo/student"],
      institutionalStudentOnly: true,
    },
    {
      label: "Reglas",
      href: "/institution/rules",
      icon: BookOpen,
      activePaths: ["/institution/rules"],
      activePrefixes: ["/institution/rules"],
      institutionalStudentOnly: true,
    },
    {
      label: "Dashboard",
      labelKey: "nav.dashboard",
      href: "/mobile-dashboard",
      icon: Home,
      activePaths: ["/mobile-dashboard", "/dashboard"],
      individualOnly: true,
    },
    {
      label: "Entrenar",
      labelKey: "nav.train",
      href: trainingHref,
      icon: CircleAlert,
      activePaths: trainingActivePaths,
      activePrefixes: trainingActivePrefixes,
      individualOnly: true,
    },
    {
      label: "Evaluar",
      labelKey: "nav.evaluate",
      href: evaluationsHref,
      icon: ShieldCheck,
      activePaths: evaluationsActivePaths,
      activePrefixes: evaluationsActivePrefixes,
    },
    {
      label: "Ref Perf.",
      labelKey: "nav.performance",
      href: "/performance",
      icon: Activity,
      activePaths: ["/performance", "/stats", "/ranking", "/mobile-stats"],
      activePrefixes: ["/performance"],
      individualOnly: true,
    },
  ] satisfies NavItem[];
}

function getSecondaryMobileItems() {
  return [
    {
      label: "Mis partidos",
      labelKey: "nav.matches",
      href: "/matches",
      icon: NotebookTabs,
      activePaths: matchesActivePaths,
      activePrefixes: matchesActivePrefixes,
    },
    {
      label: "RefLab",
      labelKey: "nav.reflab",
      href: "/about",
      icon: Info,
      activePaths: ["/about"],
    },
    {
      label: "Biblioteca",
      labelKey: "nav.library",
      href: "/learning",
      icon: BookOpen,
      activePaths: ["/learning"],
    },
    {
      label: "Perfil",
      labelKey: "nav.profile",
      href: "/profile",
      icon: User,
      activePaths: ["/profile"],
      individualOnly: true,
    },
    {
      label: "Instituciones",
      labelKey: "nav.institutions",
      href: "/institutional",
      icon: Landmark,
      activePaths: ["/institutional"],
    },
    {
      label: "Notificaciones",
      labelKey: "nav.notifications",
      href: "/notifications",
      icon: Bell,
      activePaths: ["/notifications"],
    },
    {
      label: "Soporte",
      labelKey: "nav.support",
      href: "/support",
      icon: LifeBuoy,
      activePaths: ["/support"],
    },
    {
      label: "Admin",
      labelKey: "nav.admin",
      href: "/admin",
      icon: Clapperboard,
      activePaths: ["/admin", "/admin-clips"],
      activePrefixes: ["/admin"],
      adminOnly: true,
    },
  ] satisfies NavItem[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { userId, isLoaded: authLoaded } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("es");
  const { currentDiscipline, hasSelectedDiscipline, isHydrated } =
    useDiscipline();
  const roleState = useUserRole();
  const discipline = getDisciplineDefinition(currentDiscipline);
  const theme = discipline.theme;
  const trainingHref = getDisciplineRoute(currentDiscipline, "trainingHub");
  const evaluationsHref = getDisciplineRoute(
    currentDiscipline,
    "evaluationsHub"
  );
  const visibleNavItems = filterNavItems(
    getDesktopNavItems(trainingHref, evaluationsHref),
    roleState
  );
  const visibleMobileItems = filterNavItems(
    getPrimaryMobileItems(trainingHref, evaluationsHref),
    roleState
  );
  const mobileNavGrid =
    visibleMobileItems.length <= 3
      ? "grid-cols-3"
      : visibleMobileItems.length === 4
        ? "grid-cols-4"
        : "grid-cols-5";
  const visibleSecondaryItems = filterNavItems(getSecondaryMobileItems(), roleState);
  const requiresDisciplineSelection =
    authLoaded &&
    Boolean(userId) &&
    !hasSelectedDiscipline &&
    !isDisciplineExemptPath(pathname);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLanguage(getStoredLanguage());
    }, 0);
    const unsubscribe = subscribeToLanguageChange(setLanguage);

    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!requiresDisciplineSelection) return;
    if (!isHydrated) return;

    router.replace(`/discipline?next=${encodeURIComponent(pathname)}`);
  }, [isHydrated, pathname, requiresDisciplineSelection, router]);

  if (requiresDisciplineSelection || (authLoaded && Boolean(userId) && !isHydrated && !isDisciplineExemptPath(pathname))) {
    return (
      <div className="min-h-screen overflow-hidden bg-[#050b12] text-white">
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-[420px] rounded-[30px] border border-white/10 bg-[#0b131b] p-7 text-center shadow-2xl">
            <div
              className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-white/10"
              style={{ borderTopColor: theme.accent }}
            />
            <p
              className="mt-5 text-sm font-black uppercase tracking-[0.26em]"
              style={{ color: theme.accent }}
            >
              RefLab
            </p>
            <p className="mt-3 text-lg font-black">
              Preparando tu disciplina activa
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Cargando la disciplina activa para mantener Dashboard, Biblioteca,
              Perfil y rendimiento sincronizados.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reflab-app-shell min-h-screen overflow-x-hidden text-white">
      <PushDeviceSync />
      <aside className="reflab-app-chrome fixed left-0 top-0 z-40 hidden h-screen w-[260px] border-r border-white/10 p-5 lg:block">
        <Logo
          theme={theme}
          logoSrc={discipline.logoSrc}
          isFutsal={currentDiscipline === "futsal"}
        />

        <nav className="mt-10 space-y-2" aria-label="Navegacion principal">
          {visibleNavItems.map((item) => (
            <NavLink
              key={`${item.label}-${item.href}`}
              item={item}
              language={language}
              active={isItemActive(pathname, item)}
              theme={theme}
            />
          ))}
        </nav>
      </aside>

      <header className="reflab-app-chrome fixed left-[260px] right-0 top-0 z-40 hidden h-[76px] items-center justify-end border-b border-white/10 px-8 backdrop-blur-xl lg:flex">
        <DisciplineHeaderSwitch />
      </header>

      <header className="reflab-app-chrome fixed left-0 top-0 z-50 flex h-[76px] w-full max-w-full items-center justify-between border-b border-white/10 px-3 backdrop-blur-xl sm:px-4 lg:hidden">
        <Logo
          compact
          theme={theme}
          logoSrc={discipline.logoSrc}
          isFutsal={currentDiscipline === "futsal"}
        />
        <div className="flex items-center gap-2">
          <DisciplineHeaderSwitch compact />
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? translate(language, "nav.closeMenu") : translate(language, "nav.openMenu")}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white shadow-lg transition active:scale-95"
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden">
          <div className="mx-3 mt-[86px] max-h-[calc(100dvh-108px)] overflow-y-auto rounded-[28px] border border-white/10 bg-[#0b131b] p-3 shadow-2xl sm:mx-4">
            <p
              className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.28em]"
              style={{ color: theme.accent }}
            >
              {translate(language, "nav.moreAccess")}
            </p>

            <div className="grid gap-2">
              {visibleSecondaryItems.map((item) => (
                <MobileMenuLink
                  key={`${item.label}-${item.href}`}
                  item={item}
                  language={language}
                  active={isItemActive(pathname, item)}
                  onClick={() => setMobileMenuOpen(false)}
                  theme={theme}
                />
              ))}
            </div>

            <LanguageSettings language={language} onChange={setLanguage} theme={theme} />
          </div>
        </div>
      )}

      <main className="min-h-screen w-full max-w-full overflow-x-hidden px-3 pb-[calc(150px+env(safe-area-inset-bottom))] pt-[88px] sm:px-5 lg:ml-[260px] lg:px-8 lg:pb-8 lg:pt-[96px]">
        <div className="mx-auto w-full max-w-full sm:max-w-[560px] lg:max-w-[1180px]">
          {children}
        </div>
      </main>

      <nav
        className={`reflab-app-nav fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-2 right-2 z-50 grid h-[74px] ${mobileNavGrid} rounded-[26px] border border-white/10 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:left-3 sm:right-3 lg:hidden`}
      >
        {visibleMobileItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item);
          const label = item.labelKey ? translate(language, item.labelKey) : item.label;

          return (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              style={
                active
                  ? {
                      backgroundColor: theme.button,
                      color: theme.onAccent,
                      boxShadow: `0 0 24px ${theme.glow}`,
                    }
                  : undefined
              }
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-0.5 text-[9px] font-black leading-none transition active:scale-95 sm:px-1 sm:text-[10px] ${
                active
                  ? ""
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              <Icon size={20} />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Logo({
  compact = false,
  theme,
  logoSrc,
  isFutsal,
}: {
  compact?: boolean;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  logoSrc: string;
  isFutsal: boolean;
}) {
  const logoSizeClass = compact ? "h-[42px] w-[42px]" : "h-[46px] w-[46px]";

  return (
    <Link
      href="/about"
      aria-label="Abrir pagina institucional de RefLab"
      className="flex min-w-0 items-center gap-3"
    >
      <span
        className={`${logoSizeClass} grid shrink-0 place-items-center overflow-hidden rounded-full`}
        style={{ filter: `drop-shadow(0 0 10px ${theme.glow})` }}
      >
        <Image
          src={logoSrc}
          alt={isFutsal ? "RefLab Futsal" : "RefLab Futbol 11"}
          width={RF_LOGO_SIZE}
          height={RF_LOGO_SIZE}
          sizes={compact ? "42px" : "46px"}
          priority
          className={`h-full w-full object-cover ${isFutsal ? "scale-[1.42]" : ""}`}
        />
      </span>

      <div className={`${compact ? "hidden min-[390px]:block" : ""} min-w-0`}>
        <p
          className={`${compact ? "text-sm" : "text-lg"} truncate font-black tracking-wide`}
        >
          REF<span style={{ color: theme.accent }}>LAB</span>
        </p>
        <p className={`${compact ? "text-[9px]" : "text-[10px]"} truncate text-zinc-500`}>
          Referee Decision Lab
        </p>
      </div>
    </Link>
  );
}

function NavLink({
  item,
  active,
  language,
  theme,
}: {
  item: NavItem;
  active: boolean;
  language: AppLanguage;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  const Icon = item.icon;
  const label = item.labelKey ? translate(language, item.labelKey) : item.label;

  return (
    <Link
      href={item.href}
      style={
        active
          ? {
              backgroundColor: theme.button,
              color: theme.onAccent,
              boxShadow: `0 0 28px ${theme.glow}`,
            }
          : undefined
      }
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-black transition ${
        active
          ? ""
          : "text-zinc-400 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={18} />
      {label}
    </Link>
  );
}

function MobileMenuLink({
  item,
  active,
  language,
  onClick,
  theme,
}: {
  item: NavItem;
  active: boolean;
  language: AppLanguage;
  onClick: () => void;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  const Icon = item.icon;
  const label = item.labelKey ? translate(language, item.labelKey) : item.label;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      style={
        active
          ? {
              backgroundColor: theme.button,
              color: theme.onAccent,
            }
          : undefined
      }
      className={`flex min-h-14 items-center gap-3 rounded-2xl px-4 text-sm font-black transition active:scale-[0.98] ${
        active
          ? ""
          : "bg-white/[0.04] text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={20} />
      {label}
    </Link>
  );
}

function filterNavItems(
  items: NavItem[],
  roleState: ReturnType<typeof useUserRole>
) {
  if (roleState.loadingRole) {
    return items.filter(
      (item) => !item.adminOnly && !item.institutionalStudentOnly
    );
  }

  return items.filter((item) => {
    if (item.adminOnly && !roleState.isVideoAdmin) return false;
    if (item.individualOnly && !roleState.canUseIndividualPremium) return false;
    if (item.institutionalStudentOnly && !roleState.isInstitutionStudent) {
      return false;
    }
    return true;
  });
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

function isDisciplineExemptPath(pathname: string) {
  return pathname === "/about";
}

function LanguageSettings({
  language,
  onChange,
  theme,
}: {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  function changeLanguage(nextLanguage: AppLanguage) {
    setStoredLanguage(nextLanguage);
    onChange(nextLanguage);
  }

  return (
    <div className="mt-3 rounded-[24px] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center gap-3 px-1 pb-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-2xl border"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.accentSoft,
            color: theme.accent,
          }}
        >
          <Settings size={18} />
        </div>
        <div>
          <p className="text-sm font-black text-white">{translate(language, "settings.title")}</p>
          <p className="text-xs text-zinc-500">{translate(language, "settings.languageSubtitle")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2" aria-label={translate(language, "settings.selectLanguage")}>
        {languageOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => changeLanguage(option.value)}
            style={
              language === option.value
                ? {
                    borderColor: theme.accent,
                    backgroundColor: theme.button,
                    color: theme.onAccent,
                  }
                : undefined
            }
            className={`min-h-12 rounded-2xl border px-2 text-xs font-black transition active:scale-95 ${
              language === option.value
                ? ""
                : "border-white/10 bg-black/20 text-zinc-300"
            }`}
          >
            <span className="mb-1 flex items-center justify-center gap-1">
              <Languages size={14} /> {option.shortLabel}
            </span>
            <span className="block truncate">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
