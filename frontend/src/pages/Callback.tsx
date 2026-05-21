import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

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
    <div className="min-h-screen bg-spotify-dark flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
