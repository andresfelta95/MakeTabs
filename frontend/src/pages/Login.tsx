import { loginUrl } from "../api/auth";

export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-6">
      <div className="w-full max-w-sm space-y-8 text-center">
        {/* Brand */}
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent/25 bg-accent-soft shadow-[0_0_40px_-8px_var(--accent)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-accent">
                <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
            </div>
          </div>
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-primary">
              Make<span className="text-accent">Tabs</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              Any song → <span className="text-accent">guitar tabs</span> &{" "}
              <span className="text-chip">16-bit chiptunes</span>
            </p>
          </div>
        </div>

        {/* CTA — Spotify brand green, on purpose */}
        <a
          href={loginUrl}
          className="flex items-center justify-center gap-3 rounded-full bg-spotify-green px-8 py-3.5
                     font-semibold text-black shadow-lg shadow-spotify-green/20
                     transition-transform hover:scale-105 active:scale-95"
        >
          <SpotifyIcon />
          Continue with Spotify
        </a>

        <p className="text-xs text-secondary/70">
          Your playlists are only used to select songs. No data is shared.
        </p>
      </div>
    </div>
  );
}

function SpotifyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
    </svg>
  );
}
