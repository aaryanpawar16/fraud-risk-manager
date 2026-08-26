/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "var(--bg-base)",
        surface: "var(--bg-surface)",
        "surface-raised": "var(--bg-surface-raised)",
        hover: "var(--bg-hover)",
        hairline: "var(--border-hairline)",
        accent: "var(--accent)",
        "signal-high": "var(--signal-high)",
        "signal-medium": "var(--signal-medium)",
        "signal-low": "var(--signal-low)",
      },
      fontFamily: {
        display: ["Syne", "system-ui", "sans-serif"],
        body: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
      },
    },
  },
  plugins: [],
};
