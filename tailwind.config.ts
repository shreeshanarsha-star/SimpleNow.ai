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
        surface: "#fcfcfb",
        page: "#f9f9f7",
        border: {
          DEFAULT: "#e1e0d9",
          strong: "rgba(11,11,11,.10)",
        },
        ink: {
          DEFAULT: "#0b0b0b",
          2: "#52514e",
          muted: "#898781",
        },
        brand: {
          DEFAULT: "#2a78d6",
          wash: "#eaf2fc",
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
        // Warm coral-orange for the Overview search bar's send button --
        // none of the existing semantic tokens (brand blue, good green,
        // warning yellow, critical red-pink) matched the reference design.
        // Picked as brand blue's complement on the color wheel (blue
        // #2a78d6 vs. orange ~#20deg hue) rather than the earlier muted
        // brick tone, which read too brown/dull against the cool blue and
        // warm off-white surface (#fcfcfb) it sits next to.
        accent: {
          DEFAULT: "#e8602e",
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
