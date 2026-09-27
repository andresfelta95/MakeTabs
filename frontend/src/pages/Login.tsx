import { loginUrl } from "../api/auth";
import PixelSprite from "./../components/PixelSprite";
import PianoRollBackdrop from "../components/PianoRollBackdrop";
import { SPRITES } from "../lib/sprites";

export default function Login() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base px-6">
      <PianoRollBackdrop seed={5} intensity={0.75} className="absolute inset-0" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(38rem 26rem at 50% 45%, var(--bg-base) 25%, transparent 100%)",
        }}
      />

      <div className="relative w-full max-w-sm space-y-8 text-center">
        {/* Brand */}
        <div className="space-y-5">
          <div className="flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center border border-accent/25 bg-accent-soft">
              <PixelSprite
                sprite={SPRITES.pick}
                label="MakeTabs"
                className="h-12 w-12 text-accent pix-glow pix-bob"
              />
            </div>
          </div>
          <div>
            <h1 className="font-pixel text-xl leading-relaxed text-primary">
              Make<span className="text-accent">Tabs</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              Any song → <span className="text-accent">guitar tabs</span> &{" "}
              <span className="text-chip">16-bit chiptunes</span>
            </p>
          </div>
        </div>

        {/* The two outputs, as their sprites */}
        <div className="flex items-center justify-center gap-6 text-secondary">
          <span className="flex flex-col items-center gap-1.5">
            <PixelSprite sprite={SPRITES.pick} className="h-7 w-7 text-accent" />
            <span className="font-pixel text-[8px]">Tabs</span>
          </span>
          <span className="font-mono text-xs opacity-50">+</span>
          <span className="flex flex-col items-center gap-1.5">
            <PixelSprite sprite={SPRITES.cart} className="h-7 w-7 text-chip" />
            <span className="font-pixel text-[8px]">16-bit</span>
          </span>
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
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
