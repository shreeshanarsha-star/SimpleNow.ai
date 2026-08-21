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
        // Warm ivory, restrained -- background should read as quiet paper,
        // not as "the gold theme." Gold is reserved for the accent tokens
        // below and used sparingly, not as the dominant surface color.
        surface: "#fffdf9",
        page: "#f7f4ec",
        border: {
          DEFAULT: "#e9e3d3",
          strong: "rgba(48,40,16,.14)",
        },
        // Deep charcoal, not flat black -- reads as premium enterprise
        // typography rather than harsh pure-black text.
        ink: {
          DEFAULT: "#211f1a",
          2: "#5c584c",
          muted: "#8c8776",
        },
        // Antique/champagne gold -- an accent color, not a dominant one.
        // wash is the very light champagne tint used for the active nav
        // state; it must stay subtle (this is not a button fill color).
        brand: {
          DEFAULT: "#8a6a10",
          wash: "#f6efdb",
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
        // Restrained, quiet elevation -- a single soft ambient shadow, no
        // inset highlight/emboss. The goal is "sits gently above the
        // page," not "raised metal object." Two weights so primary chrome
        // (sidebar, search bar) can read as very slightly more present
        // than secondary rows/buttons, without either one calling
        // attention to itself.
        soft: "0 1px 2px rgba(33,27,10,0.04), 0 8px 20px -10px rgba(33,27,10,0.10)",
        "soft-sm": "0 1px 2px rgba(33,27,10,0.05)",
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
