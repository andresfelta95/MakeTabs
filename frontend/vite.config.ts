import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const certsDir = path.resolve(__dirname, "../backend/certs");
const certExists = fs.existsSync(path.join(certsDir, "localhost.pem"));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    https: certExists
      ? {
          cert: fs.readFileSync(path.join(certsDir, "localhost.pem")),
          key: fs.readFileSync(path.join(certsDir, "localhost-key.pem")),
        }
      : undefined,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/health": "http://127.0.0.1:8000",
    },
  },
});
