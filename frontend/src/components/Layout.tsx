import { useAuth } from "../hooks/useAuth";
import { logout } from "../api/auth";
import { useQueryClient } from "@tanstack/react-query";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-spotify-dark text-white">
      <header className="bg-spotify-black px-6 py-4 flex items-center justify-between border-b border-white/10">
        <h1 className="text-xl font-bold text-spotify-green tracking-tight">MakeTabs</h1>
        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-400">{user.display_name}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
