/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        quantum: {
          bg: "#070B14",
          surface: "#0F1629",
          panel: "#141D35",
          border: "#223055",
          cyan: "#22D3EE",
          violet: "#A78BFA",
          emerald: "#34D399",
          amber: "#FBBF24",
          rose: "#FB7185",
        },
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '"Noto Sans Devanagari"',
          '"Noto Sans Gujarati"',
          '"Noto Sans Kannada"',
          '"Noto Sans Tamil"',
          '"Noto Sans Telugu"',
          '"Noto Sans Bengali"',
          "system-ui",
          "sans-serif",
        ],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};
