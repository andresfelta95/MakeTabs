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
      <header className="bg-elevated border-b border-theme sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GuitarPickIcon />
            <span className="text-lg font-bold text-accent tracking-tight">MakeTabs</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="p-2 rounded-full hover:bg-card-hover transition-colors text-secondary hover:text-primary"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            {user && (
              <>
                <span className="text-sm text-secondary hidden sm:block">{user.display_name}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-secondary hover:text-primary transition-colors"
                >
                  Log out
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
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
