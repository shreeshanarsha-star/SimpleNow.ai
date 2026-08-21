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
        // "Rich dimensional" direction (approved from the A/B comparison):
        // layered shadow + inset top highlight, so primary chrome reads as
        // gently raised/embossed gold rather than a flat card with a
        // drop-shadow filter. Two weights: `soft` for primary chrome
        // (search bar, cards), `soft-sm` for secondary buttons/rows.
        soft: "0 1px 1px rgba(92,72,19,0.06), 0 14px 30px -8px rgba(92,72,19,0.28), inset 0 1px 0 rgba(255,255,255,0.85)",
        "soft-sm": "0 2px 6px rgba(154,120,20,0.25), inset 0 1px 0 rgba(255,255,255,0.8)",
        // Directional shadow cast rightward by the sidebar panel, and
        // downward by the topbar -- these read as physical panels sitting
        // above the page, not just bordered rectangles.
        "panel-right": "4px 0 24px rgba(90,68,10,0.14)",
        button: "0 3px 8px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.15)",
        emblem: "0 3px 8px rgba(90,68,10,0.4), inset 0 1px 1px rgba(255,255,255,0.6)",
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
