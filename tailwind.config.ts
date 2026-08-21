import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "var(--surface)",
        page: "var(--page)",
        border: {
          DEFAULT: "rgb(var(--border-rgb) / <alpha-value>)",
          strong: "var(--border-strong)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          muted: "var(--ink-muted)",
        },
        brand: {
          DEFAULT: "rgb(var(--brand-rgb) / <alpha-value>)",
          wash: "var(--brand-wash)",
          dark: "var(--brand-dark)",
        },
        good: {
          DEFAULT: "#0ca30c",
          text: "#006300",
          wash: "#eaf7ea",
        },
        critical: {
          DEFAULT: "#d03b3b",
          wash: "#fbe4e4",
        },
        warning: {
          DEFAULT: "#fab219",
          wash: "#fdf1da",
        },
      },
      borderRadius: {
        lg: "16px",
        md: "10px",
        sm: "7px",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        "soft-sm": "var(--shadow-soft-sm)",
        "panel-right": "var(--shadow-panel-right)",
        button: "var(--shadow-button)",
        emblem: "var(--shadow-emblem)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
