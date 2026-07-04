import type { Config } from "tailwindcss";

const withOpacity = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: withOpacity("--color-bg"),
        surface: withOpacity("--color-surface"),
        "surface-2": withOpacity("--color-surface-2"),
        ink: withOpacity("--color-text"),
        muted: withOpacity("--color-text-muted"),
        faint: withOpacity("--color-text-faint"),
        primary: withOpacity("--color-primary"),
        "primary-2": withOpacity("--color-primary-2"),
        success: withOpacity("--color-success"),
        warning: withOpacity("--color-warning"),
        danger: withOpacity("--color-danger"),
        neutral: withOpacity("--color-neutral"),
        overlay: withOpacity("--color-overlay"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        logo: ["var(--font-logo)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--color-primary) / 0.15), 0 8px 30px rgb(var(--color-primary) / 0.12)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 20% 0%, rgb(var(--color-primary) / 0.18), transparent 45%), radial-gradient(circle at 90% 10%, rgb(var(--color-primary-2) / 0.14), transparent 40%)",
      },
    },
  },
  plugins: [],
};

export default config;
