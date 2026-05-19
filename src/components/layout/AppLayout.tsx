import { Link, useLocation } from "react-router";
import { PromptDrawer } from "@/components/PromptDrawer";
import { PromptContextProvider, useSharedPromptContext } from "@/providers/PromptContext";
import { useCanonicalPromptContext } from "@/hooks/useCanonicalPromptContext";
import { useAuth } from "@/hooks/useAuth";
import { useSupabaseSession } from "@/hooks/useSupabaseSession";
import { supabase } from "@/lib/supabase-client";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Moon,
  GraduationCap,
  FlaskConical,
  Dumbbell,
  Apple,
  HeartPulse,
  Briefcase,
  Wallet,
  BookOpen,
  Users,
  Brain,
  BarChart3,
  Archive,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useUIMode } from "@/providers/UIModeContext";

type NavItem = { path: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };
type NavSection = { heading: string; items: NavItem[]; collapsible?: boolean };

const navSections: NavSection[] = [
  {
    heading: "Command",
    items: [
      { path: "/", label: "Daily OS", icon: LayoutDashboard },
      { path: "/tasks", label: "Tasks", icon: ListChecks },
      { path: "/calendar", label: "Calendar", icon: CalendarDays },
      { path: "/weekly-review", label: "Weekly Review", icon: BarChart3 },
      { path: "/archive", label: "History", icon: Archive },
    ],
  },
  {
    heading: "Wellness",
    collapsible: true,
    items: [
      { path: "/sleep", label: "Sleep", icon: Moon },
      { path: "/workout", label: "Workout", icon: Dumbbell },
      { path: "/nutrition", label: "Nutrition", icon: Apple },
      { path: "/health", label: "Health", icon: HeartPulse },
    ],
  },
  {
    heading: "Mind + School",
    collapsible: true,
    items: [
      { path: "/academics", label: "Academics", icon: GraduationCap },
      { path: "/mcat", label: "MCAT", icon: FlaskConical },
      { path: "/substance", label: "Depth & Learning", icon: Brain },
    ],
  },
  {
    heading: "Direction",
    collapsible: true,
    items: [
      { path: "/career", label: "Career", icon: Briefcase },
      { path: "/money", label: "Money", icon: Wallet },
      { path: "/faith", label: "Faith", icon: BookOpen },
      { path: "/relationships", label: "Relationships", icon: Users },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PromptContextProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </PromptContextProvider>
  );
}

function ModeToggle({ collapsed }: { collapsed: boolean }) {
  const { mode, setMode, toggleMode } = useUIMode();
  if (collapsed) {
    return (
      <button
        onClick={toggleMode}
        title={`Mode: ${mode === "simple" ? "Simple" : "Advanced"} (click to switch)`}
        className="flex w-full items-center justify-center rounded-lg p-1.5 text-[10px] font-semibold uppercase text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {mode === "simple" ? "S" : "A"}
      </button>
    );
  }
  return (
    <div className="inline-flex w-full items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {(["simple", "advanced"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize transition-colors ${
            mode === m
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user: kimiUser, logout } = useAuth();
  const { session: supabaseSession } = useSupabaseSession();
  const sharedPromptContext = useSharedPromptContext();
  const canonicalPromptContext = useCanonicalPromptContext();
  // Canonical Saved state wins for the data fields it owns; page
  // pushes (e.g. Dashboard decision summaries) survive for keys canonical
  // does not produce.
  const promptContext = { ...sharedPromptContext, ...canonicalPromptContext };
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const user = kimiUser ?? (supabaseSession?.user ? {
    avatar: null,
    name: supabaseSession.user.email ?? "Supabase user",
  } : null);

  const toggleSidebar = useCallback(() => setCollapsed((p) => !p), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        window.dispatchEvent(new CustomEvent("lifeee:escape"));
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
        return;
      }

      if (
        event.key.toLowerCase() === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target)
      ) {
        const capture = document.querySelector<HTMLElement>('[data-lifeee-capture-input="true"]');
        if (capture) {
          event.preventDefault();
          capture.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location.pathname]);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex min-h-svh overflow-hidden bg-background text-foreground">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#25313c]/20 backdrop-blur-[1px] lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-xl border border-border bg-card/95 p-2 text-foreground shadow-sm backdrop-blur lg:hidden"
        aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed z-40 flex h-full flex-col border-r border-border/80 bg-sidebar/95 shadow-[10px_0_32px_rgba(36,49,60,0.05)] backdrop-blur-xl transition-all duration-200 lg:relative ${
          collapsed ? "w-[56px]" : "w-[220px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4">
          {!collapsed && (
            <div>
              <div className="text-base font-semibold tracking-tight text-foreground">
                Lifeee
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                {today}
              </div>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="hidden rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-2">
          {navSections.map((section) => {
            const content = section.items.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={closeMobile}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-150 ${
                      isActive
                        ? "border-l-2 border-[#6b87ae] bg-primary/10 text-foreground shadow-sm"
                        : "border-l-2 border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    } ${collapsed ? "justify-center px-2" : ""}`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              });

            if (collapsed || !section.collapsible) {
              return (
                <div key={section.heading} className="space-y-1">
                  {!collapsed && (
                    <div className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
                      {section.heading}
                    </div>
                  )}
                  {content}
                </div>
              );
            }

            return (
              <details key={section.heading} className="group space-y-1" open>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80 hover:bg-muted/40">
                  {section.heading}
                  <ChevronRight
                    size={12}
                    className="transition-transform group-open:rotate-90"
                  />
                </summary>
                {content}
              </details>
            );
          })}
        </nav>

        {/* Simple / Advanced mode toggle */}
        <div className="border-t border-border/80 px-3 py-3">
          <ModeToggle collapsed={collapsed} />
        </div>

        {/* User section */}
        <div className="border-t border-border/80 px-3 py-3">
          {user ? (
            <div className="flex items-center gap-2">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-7 h-7 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <span className="text-[10px] font-medium text-primary">
                    {(user.name || "U")[0].toUpperCase()}
                  </span>
                </div>
              )}
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-xs text-muted-foreground">
                    {user.name || "User"}
                  </span>
                  <button
                    onClick={() => {
                      if (supabaseSession && supabase) {
                        void supabase.auth.signOut();
                      }
                      if (kimiUser) logout();
                    }}
                    className="p-1 text-muted-foreground transition-colors hover:text-[#c97a73]"
                  >
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10 hover:text-[#5e7ea4]"
            >
              <LogOut size={16} />
              {!collapsed && <span>Login</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1440px] mx-auto p-4 lg:p-6 pt-16 lg:pt-6">
          {!user ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
              <span>
                You&apos;re viewing draft mode. Log in to save your progress and unlock all features.
              </span>
              <Link
                to="/login"
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Log in
              </Link>
            </div>
          ) : null}
          {children}
        </div>
      </main>
      <PromptDrawer context={promptContext} />
    </div>
  );
}
