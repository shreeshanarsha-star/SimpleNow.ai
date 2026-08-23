// A small, safe arithmetic evaluator -- no eval()/Function() on user text,
// ever. Supports + - * / % ^ (), unary minus, decimals, and parentheses.
// Recursive-descent parser over a fixed grammar; anything outside that
// grammar throws instead of being silently coerced.

class CalcError extends Error {}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
      continue;
    }
    if ("+-*/%^()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    throw new CalcError(`Unsupported character: "${c}"`);
  }
  return tokens;
}

export function evaluateExpression(expr: string): number {
  const tokens = tokenize(expr.replace(/[,₹$]/g, "").replace(/x/gi, "*"));
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function next() {
    return tokens[pos++];
  }

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parsePow();
    while (peek() === "*" || peek() === "/" || peek() === "%") {
      const op = next();
      const rhs = parsePow();
      if (op === "*") value *= rhs;
      else if (op === "/") {
        if (rhs === 0) throw new CalcError("Division by zero.");
        value /= rhs;
      } else value %= rhs;
    }
    return value;
  }

  function parsePow(): number {
    const base = parseUnary();
    if (peek() === "^") {
      next();
      const exp = parsePow();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (peek() === "-") {
      next();
      return -parseUnary();
    }
    if (peek() === "+") {
      next();
      return parseUnary();
    }
    return parseAtom();
  }

  function parseAtom(): number {
    const tok = peek();
    if (tok === "(") {
      next();
      const value = parseExpr();
      if (next() !== ")") throw new CalcError("Mismatched parentheses.");
      return value;
    }
    if (tok !== undefined && /^[0-9.]+$/.test(tok)) {
      next();
      const n = Number(tok);
      if (Number.isNaN(n)) throw new CalcError(`Invalid number: "${tok}"`);
      return n;
    }
    throw new CalcError(`Unexpected token: "${tok ?? "end of expression"}"`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new CalcError(`Unexpected trailing input near "${tokens[pos]}"`);
  if (!Number.isFinite(result)) throw new CalcError("Result is not a finite number.");
  return result;
}
