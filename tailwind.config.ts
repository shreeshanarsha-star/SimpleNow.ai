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
        // Warm ivory/cream, not the earlier cooler off-white -- matches
        // the gold Sri Chakra branding instead of fighting it.
        surface: "#fffdf6",
        page: "#faf5ea",
        border: {
          DEFAULT: "#e6ddc7",
          strong: "rgba(90,68,10,.14)",
        },
        ink: {
          DEFAULT: "#0b0b0b",
          2: "#52514e",
          muted: "#898781",
        },
        // Was brand blue (#2a78d6) everywhere -- replaced with a deep
        // antique gold so the whole app (nav active state, links, CTA
        // buttons, badges) reads as one consistent gold theme instead of
        // a gold logo bolted onto a blue product. #8a6a10 specifically
        // chosen for ~5:1 contrast against white text on solid buttons
        // (WCAG AA), not just picked for looks -- a brighter/lighter gold
        // reads nicely as a label color but fails contrast as a button fill.
        brand: {
          DEFAULT: "#8a6a10",
          wash: "#f7ecd0",
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
      fontFamily: {
        sans: [
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
