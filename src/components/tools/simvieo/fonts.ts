// Fonts for canvas text. Self-hosted OFL fonts (public/simvieo/fonts) loaded
// with the FontFace API -- no build-time or third-party fetch, and canvas
// can use them as soon as ensureFontsLoaded() resolves.

const BASE = "/simvieo/fonts";

export const FONTS = {
  display: `"SimVieo Display", "Poppins", system-ui, sans-serif`,
  body: `"SimVieo Body", "Inter", system-ui, sans-serif`,
  serif: `"SimVieo Serif", Georgia, serif`,
};

const FACES: [string, string, string][] = [
  ["SimVieo Display", "poppins-latin-600-normal.woff2", "600"],
  ["SimVieo Display", "poppins-latin-700-normal.woff2", "700"],
  ["SimVieo Display", "poppins-latin-800-normal.woff2", "800"],
  ["SimVieo Body", "inter-latin-500-normal.woff2", "500"],
  ["SimVieo Body", "inter-latin-600-normal.woff2", "600"],
  ["SimVieo Body", "inter-latin-700-normal.woff2", "700"],
  ["SimVieo Serif", "playfair-display-latin-700-normal.woff2", "700"],
];

let loading: Promise<void> | null = null;

export function ensureFontsLoaded(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return Promise.resolve();
  if (!loading) {
    loading = Promise.all(
      FACES.map(async ([family, file, weight]) => {
        try {
          const face = new FontFace(family, `url(${BASE}/${file}) format("woff2")`, { weight, style: "normal", display: "block" });
          await face.load();
          document.fonts.add(face);
        } catch {
          /* fall back to system fonts */
        }
      })
    ).then(() => undefined);
  }
  return loading;
}
