import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import PixelSprite from "../components/PixelSprite";
import { SPRITES } from "../lib/sprites";

export default function Callback() {
  const navigate = useNavigate();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error || !code || !state) {
      navigate("/login?error=spotify", { replace: true });
      return;
    }

    client
      .post("/auth/exchange", { code, state })
      .then(() => navigate("/", { replace: true }))
      .catch(() => navigate("/login?error=exchange", { replace: true }));
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base">
      <PixelSprite sprite={SPRITES.pick} className="h-10 w-10 text-accent pix-bob" />
      <span className="font-pixel text-[9px] text-secondary">Connecting…</span>
    </div>
  );
}
