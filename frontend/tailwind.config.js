/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        spotify: {
          green: "#1DB954",
          black: "#191414",
          dark: "#121212",
          card: "#282828",
          hover: "#3E3E3E",
        },
      },
    },
  },
  plugins: [],
};
