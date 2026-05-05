import { Link, useLocation } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  Moon,
  GraduationCap,
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
import { useState, useCallback } from "react";

const navItems = [
  { path: "/", label: "Daily OS", icon: LayoutDashboard },
  { path: "/sleep", label: "Sleep", icon: Moon },
  { path: "/academics", label: "Academics", icon: GraduationCap },
  { path: "/workout", label: "Workout", icon: Dumbbell },
  { path: "/nutrition", label: "Nutrition", icon: Apple },
  { path: "/health", label: "Health", icon: HeartPulse },
  { path: "/career", label: "Career", icon: Briefcase },
  { path: "/money", label: "Money", icon: Wallet },
  { path: "/faith", label: "Faith", icon: BookOpen },
  { path: "/relationships", label: "Relationships", icon: Users },
  { path: "/substance", label: "Substance", icon: Brain },
  { path: "/weekly-review", label: "Weekly Review", icon: BarChart3 },
  { path: "/archive", label: "Archive", icon: Archive },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = useCallback(() => setCollapsed((p) => !p), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const today = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 bg-[#1a1a1a] rounded-md border border-white/[0.06]"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed lg:relative z-40 h-full bg-[#0f0f0f] border-r border-white/[0.06] flex flex-col transition-all duration-200 ${
          collapsed ? "w-[56px]" : "w-[220px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Logo */}
        <div className="px-4 py-4 flex items-center justify-between">
          {!collapsed && (
            <div>
              <div className="text-[#eaeaea] font-bold text-base tracking-tight">
                Lifeee
              </div>
              <div className="text-[#777777] text-[10px] uppercase tracking-wider mt-0.5">
                {today}
              </div>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="hidden lg:flex p-1 text-[#444444] hover:text-[#777777] transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={closeMobile}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-[#1a1a1a] text-[#eaeaea] border-l-2 border-[#3b82f6]"
                    : "text-[#444444] hover:text-[#777777] hover:bg-white/[0.02] border-l-2 border-transparent"
                } ${collapsed ? "justify-center px-2" : ""}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-3 border-t border-white/[0.06]">
          {user ? (
            <div className="flex items-center gap-2">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="w-7 h-7 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#3b82f6]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] text-[#3b82f6] font-medium">
                    {(user.name || "U")[0].toUpperCase()}
                  </span>
                </div>
              )}
              {!collapsed && (
                <>
                  <span className="text-xs text-[#777777] flex-1 truncate">
                    {user.name || "User"}
                  </span>
                  <button
                    onClick={logout}
                    className="text-[#444444] hover:text-[#ef4444] transition-colors p-1"
                  >
                    <LogOut size={14} />
                  </button>
                </>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#3b82f6] hover:text-[#60a5fa] transition-colors"
            >
              <LogOut size={16} />
              {!collapsed && <span>Login</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto lg:ml-0 ml-0">
        <div className="max-w-[1440px] mx-auto p-4 lg:p-6 pt-16 lg:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}
