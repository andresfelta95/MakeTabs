/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Kept for the Spotify login button only.
        spotify: {
          green: "#1DB954",
          black: "#191414",
          dark: "#121212",
          card: "#282828",
          hover: "#3E3E3E",
        },
        accent: "var(--accent)", // tube-amber (theme-aware)
        chip: "var(--chip)", // 16-bit violet
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', '"Space Grotesk"', "sans-serif"],
        body: ['"Space Grotesk"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      keyframes: {
        eq: {
          "0%, 100%": { height: "4px" },
          "50%":      { height: "16px" },
        },
      },
      animation: {
        eq1: "eq 0.8s ease-in-out infinite",
        eq2: "eq 0.8s ease-in-out 0.2s infinite",
        eq3: "eq 0.8s ease-in-out 0.4s infinite",
      },
    },
  },
  plugins: [],
};
