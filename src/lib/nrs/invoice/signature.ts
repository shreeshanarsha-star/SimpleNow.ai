// Signature pad <-> stored SVG path. Pure; used by the client pad and the
// server (validation + PDF). Strokes are normalised into a fixed
// SIG_WIDTH x SIG_HEIGHT box with integer coordinates, so the stored
// path is small and renders the same everywhere.

export const SIG_WIDTH = 600;
export const SIG_HEIGHT = 200;
const MAX_PATH_LENGTH = 60_000;

export interface SigPoint {
  x: number;
  y: number;
}

/** Strokes in canvas pixels (canvasWidth x canvasHeight) -> "M x y L x y ..." in the normalised box. */
export function strokesToPath(strokes: SigPoint[][], canvasWidth: number, canvasHeight: number): string {
  if (canvasWidth <= 0 || canvasHeight <= 0) return "";
  const sx = SIG_WIDTH / canvasWidth;
  const sy = SIG_HEIGHT / canvasHeight;
  const clampX = (v: number) => Math.min(SIG_WIDTH, Math.max(0, Math.round(v * sx)));
  const clampY = (v: number) => Math.min(SIG_HEIGHT, Math.max(0, Math.round(v * sy)));
  const parts: string[] = [];
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    let lastX = clampX(stroke[0].x);
    let lastY = clampY(stroke[0].y);
    parts.push(`M${lastX} ${lastY}`);
    if (stroke.length === 1) parts.push(`L${lastX + 1} ${lastY}`);
    for (let i = 1; i < stroke.length; i++) {
      const x = clampX(stroke[i].x);
      const y = clampY(stroke[i].y);
      if (x === lastX && y === lastY) continue;
      parts.push(`L${x} ${y}`);
      lastX = x;
      lastY = y;
    }
  }
  return parts.join(" ");
}

/** True when `path` is a normalised signature path we produced (only M/L with integer coords in the box). */
export function isValidSignaturePath(path: string): boolean {
  if (!path || path.length > MAX_PATH_LENGTH) return false;
  if (!/^M\d{1,3} \d{1,3}( [ML]\d{1,3} \d{1,3})*$/.test(path)) return false;
  const nums = path.match(/\d+/g) ?? [];
  for (let i = 0; i < nums.length; i += 2) {
    if (Number(nums[i]) > SIG_WIDTH || Number(nums[i + 1]) > SIG_HEIGHT) return false;
  }
  return nums.length >= 4;
}
