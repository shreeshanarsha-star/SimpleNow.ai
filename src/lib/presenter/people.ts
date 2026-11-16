// Presenter.ai — tolerant name matching between phone sign-ins, spoken intros
// and the people Shreesha described in the console. Server and client safe.

export const normName = (n: string) =>
  n
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function lev(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const close = (a: string, b: string) => {
  if (!a || !b) return false;
  const max = Math.max(a.length, b.length);
  // Short names differ by one letter too often (Kiran/Karan, Ravi/Rani): only long ones get slack.
  return lev(a, b) <= (max >= 10 ? 2 : max >= 7 ? 1 : 0);
};

/** 0 = no match … 100 = identical. */
export function nameScore(a: string, b: string) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  const xs = x.split(" "), ys = y.split(" ");
  // "Priya" vs "Priya Sharma", or "Priya S" vs "Priya Sharma"
  if (xs[0] === ys[0]) {
    const xl = xs[1], yl = ys[1];
    if (!xl || !yl) return 80;
    if (xl === yl || (xl.length === 1 && yl.startsWith(xl)) || (yl.length === 1 && xl.startsWith(yl))) return 85;
    return 40; // same first name, different surname: ambiguous
  }
  if (close(x, y)) return 75; // small spelling difference: "Anand" / "Anandh"
  // Common Indian spelling variants: "Preeya"/"Priya", "Gowtham"/"Gautam".
  const px = phon(xs[0]), py = phon(ys[0]);
  if (px === py && (!xs[1] || !ys[1] || xs[1][0] === ys[1][0])) return 72;
  if (close(xs[0], ys[0]) && (!xs[1] || !ys[1] || xs[1][0] === ys[1][0])) return 65;
  // Short form of a long first name: "Shakti" / "Shaktivel" (5+ letters only).
  const [a1, b1] = xs[0].length <= ys[0].length ? [px, py] : [py, px];
  if (a1.length >= 5 && b1.startsWith(a1) && (!xs[1] || !ys[1])) return 66;
  return 0;
}

function phon(w: string) {
  return w
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/(ow|ou|au|aw)/g, "o")
    .replace(/th/g, "t")
    .replace(/dh/g, "d")
    .replace(/bh/g, "b")
    .replace(/ph/g, "f")
    .replace(/sh/g, "s")
    .replace(/w/g, "v")
    .replace(/y/g, "i")
    .replace(/(.)\1+/g, "$1")
    .replace(/h$/, "");
}

/** Best unique match at or above `min`; null if none or if two candidates tie. */
export function bestMatch<T>(name: string, items: T[], nameOf: (t: T) => string, min = 65): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const it of items) {
    const sc = nameScore(name, nameOf(it));
    if (sc > bestScore) {
      best = it;
      bestScore = sc;
      tie = false;
    } else if (sc === bestScore && sc > 0) tie = true;
  }
  return best && bestScore >= min && !tie ? best : null;
}
