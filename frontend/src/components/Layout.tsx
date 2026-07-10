import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { logout } from "../api/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "../context/ThemeContext";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-base text-primary">
      <header className="sticky top-0 z-10 border-b border-theme bg-elevated/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2" aria-label="MakeTabs home">
              <GuitarPickIcon />
              <span className="font-display text-xl font-extrabold tracking-tight">
                Make<span className="text-accent">Tabs</span>
              </span>
            </Link>

            <nav className="flex items-center gap-1" aria-label="Main">
              <PageLink to="/" label="Home" />
              <PageLink to="/tabs" label="🎸 Tabs" accent="accent" />
              <PageLink to="/16bit" label="🕹️ 16-bit" accent="chip" />
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-full p-2 text-secondary transition-colors hover:bg-card-hover hover:text-primary"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            {user && (
              <>
                <span className="hidden text-sm text-secondary sm:block">{user.display_name}</span>
                <button
                  onClick={handleLogout}
                  className="rounded-full border border-theme px-3 py-1.5 text-sm text-secondary transition-colors hover:border-accent/40 hover:text-primary"
                >
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
        {/* Amp power-line: a hairline of warm glow under the header */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

function PageLink({ to, label, accent = "accent" }: { to: string; label: string; accent?: "accent" | "chip" }) {
  const activeColor = accent === "chip" ? "text-chip bg-chip/10" : "text-accent bg-accent-soft";
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
          isActive ? activeColor : "text-secondary hover:bg-card-hover hover:text-primary"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function GuitarPickIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-accent">
      <path
        d="M12 2C8.5 2 6 5 6 8c0 2.5 1.5 4.5 3 6l1.5 6.5a1.5 1.5 0 003 0L15 14c1.5-1.5 3-3.5 3-6 0-3-2.5-6-6-6z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
    </svg>
  );
}
