"use client";

import { Bell, CheckSquare, FolderKanban, LayoutDashboard, LogOut, Menu as MenuIcon, NotebookPen, Repeat, Search, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Monogram } from "@/components/brand/wordmark";
import { LiveRefresh } from "@/components/layout/live-refresh";
import { LogoutButton } from "@/components/layout/logout-button";
import { SideNavItem } from "@/components/layout/side-nav-item";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import type { SafeUser } from "@/db/schema";
import { ROLE_META } from "@/lib/constants";
import { LangToggle, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", key: "home" as const, icon: LayoutDashboard },
  { href: "/projects", key: "projects" as const, icon: FolderKanban },
  { href: "/my-tasks", key: "myTasks" as const, icon: CheckSquare },
  { href: "/personal", key: "personal" as const, icon: NotebookPen },
  { href: "/recurring", key: "recurring" as const, icon: Repeat },
  { href: "/team", key: "team" as const, icon: Users },
  { href: "/notifications", key: "notifications" as const, icon: Bell },
  { href: "/settings", key: "settings" as const, icon: Settings },
];

/** Inside a project a second sidebar with the project sections sits beside the main one. */
const PROJECT_ROUTE = /^\/projects\/[^/]+/;

export function AppShell({ user, unread, myOpen, personalOpen, version, children }: { user: SafeUser; unread: number; myOpen: number; personalOpen: number; version: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  const [railOpen, setRailOpen] = useState(false);
  const railTimer = useRef<number | null>(null);

  // reset transient state on navigation (adjusted during render, no effect needed)
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setRailOpen(false);
  }

  const inProject = PROJECT_ROUTE.test(pathname);
  // The main sidebar stays open. Only while a project panel is showing does it
  // shrink to an icon rail, which still expands over the content on hover.
  const expanded = !inProject || railOpen;

  // Small delays keep the rail from flickering when the cursor merely crosses it.
  const scheduleRail = (next: boolean, delay: number) => {
    if (railTimer.current) window.clearTimeout(railTimer.current);
    railTimer.current = window.setTimeout(() => setRailOpen(next), delay);
  };

  return (
    <div className="min-h-screen">
      <LiveRefresh version={version} />
      <aside
        data-state={expanded ? "expanded" : "collapsed"}
        onMouseEnter={inProject ? () => scheduleRail(true, 120) : undefined}
        onMouseLeave={inProject ? () => scheduleRail(false, 150) : undefined}
        onFocus={inProject ? () => scheduleRail(true, 0) : undefined}
        onBlur={
          inProject
            ? (e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) scheduleRail(false, 0);
              }
            : undefined
        }
        className={cn("fixed inset-y-0 start-0 z-40 hidden flex-col overflow-hidden border-e border-line bg-white transition-[width] duration-150 ease-out lg:flex", expanded ? "w-60" : "w-16")}
      >
        <SidebarContent user={user} unread={unread} myOpen={myOpen} personalOpen={personalOpen} pathname={pathname} expanded={expanded} />
      </aside>

      {/* Mobile drawer: always expanded. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-64 flex-col border-e border-line bg-white">
            <SidebarContent user={user} unread={unread} myOpen={myOpen} personalOpen={personalOpen} pathname={pathname} expanded onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cn("flex min-h-screen flex-col", inProject ? "lg:ps-[19rem]" : "lg:ps-60")}>
        <Topbar user={user} unread={unread} onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/** Shared sidebar body: brand header, main navigation, signed-in user. */
function SidebarContent({ user, unread, myOpen, personalOpen, pathname, expanded, onClose }: { user: SafeUser; unread: number; myOpen: number; personalOpen: number; pathname: string; expanded: boolean; onClose?: () => void }) {
  const t = useT();
  const fade = cn("min-w-0 truncate whitespace-nowrap transition-opacity duration-150", expanded ? "opacity-100" : "opacity-0");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-2">
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center" aria-label={t(dict.app.name)}>
          <span className="flex h-10 w-12 shrink-0 items-center justify-center">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-brand">
              <Monogram className="h-[18px] w-auto" color="#ffffff" />
            </span>
          </span>
          <span className={cn(fade, "ms-1 text-base font-bold leading-none text-ink")}>{t(dict.app.name)}</span>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-paper hover:text-ink" aria-label={t(dict.nav.closeMenu)}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2">
        {NAV.map((item) => (
          <SideNavItem
            key={item.href}
            href={item.href}
            label={t(dict.nav[item.key])}
            icon={item.icon}
            active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            expanded={expanded}
            count={item.key === "myTasks" && myOpen > 0 ? myOpen : item.key === "personal" && personalOpen > 0 ? personalOpen : undefined}
            badge={item.key === "notifications" && unread > 0 ? (unread > 99 ? "99+" : String(unread)) : undefined}
          />
        ))}
      </nav>

      <div className="shrink-0 border-t border-line p-2">
        <div className="flex h-12 items-center rounded-md px-2">
          <span className="flex h-10 w-8 shrink-0 items-center justify-center">
            <Avatar name={user.name} solid size="sm" />
          </span>
          <span className={cn(fade, "ms-2 flex-1 leading-tight")}>
            <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
            <span className="block truncate text-[11px] font-medium text-ink-soft">{t(ROLE_META[user.role].label)}</span>
          </span>
          <LogoutButton
            formClassName={cn(fade, "shrink-0")}
            label={t(dict.nav.logout)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
          </LogoutButton>
        </div>
      </div>
    </div>
  );
}

function Topbar({ user, unread, onMenu }: { user: SafeUser; unread: number; onMenu: () => void }) {
  const t = useT();
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white">
      <div className="flex h-14 w-full items-center gap-3 px-4 md:px-6">
        <button type="button" onClick={onMenu} className="flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-paper lg:hidden" aria-label={t(dict.nav.openMenu)}>
          <MenuIcon className="h-5 w-5" />
        </button>

        <form
          role="search"
          className="relative min-w-0 flex-1 md:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const value = q.trim();
            router.push(value ? `/search?q=${encodeURIComponent(value)}` : "/search");
          }}
        >
          <label htmlFor="global-search" className="sr-only">
            {t(dict.common.search)}
          </label>
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-ink-soft" />
          <input id="global-search" name="q" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(dict.nav.searchPlaceholder)} className="field h-9 min-h-0 bg-paper ps-9 focus:bg-white" />
        </form>

        <div className="ms-auto flex items-center gap-1.5">
          <div className="hidden sm:block">
            <LangToggle />
          </div>
          <div className="sm:hidden">
            <LangToggle compact />
          </div>
          <Link href="/notifications" className="relative flex h-9 w-9 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-paper hover:text-ink" aria-label={t(dict.nav.notifications)}>
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />}
          </Link>
          <Menu
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="flex h-9 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-paper" aria-label={t(dict.nav.profile)}>
                <Avatar name={user.name} size="sm" solid />
                <span className="hidden max-w-[140px] truncate text-sm font-medium text-ink md:block">{user.name}</span>
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                  <p className="truncate font-grotesk text-xs text-ink-soft">
                    <span dir="ltr">{user.email}</span>
                  </p>
                </div>
                <MenuSeparator />
                <MenuItem href="/settings" icon={Settings} onClick={close}>
                  {t(dict.nav.settings)}
                </MenuItem>
                <MenuItem href="/notifications" icon={Bell} onClick={close}>
                  {t(dict.nav.notifications)}
                </MenuItem>
                <MenuSeparator />
                <LogoutButton className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm font-medium text-danger transition-colors hover:bg-danger/6 disabled:opacity-50">
                  <LogOut className="h-4 w-4" />
                  {t(dict.nav.logout)}
                </LogoutButton>
              </>
            )}
          </Menu>
        </div>
      </div>
    </header>
  );
}
