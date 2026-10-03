import type { ReactNode } from "react";

// Minimal, safe markdown renderer. Builds React elements only (never
// dangerouslySetInnerHTML), so any HTML in the source is shown as text.
// Supports: # / ## / ### headings, paragraphs, - / * / 1. lists, > quotes,
// --- rules, **bold**, *italic*, `code`, and [links](https://...) (https and
// mailto only).

type Block =
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "p"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    if (list) blocks.push(list);
    if (quote.length) blocks.push({ type: "quote", text: quote.join(" ") });
    para = [];
    list = null;
    quote = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      const level = Math.min(h[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "h", level, text: h[2] });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ type: "hr" });
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      const text = (ul ?? ol)![1];
      if (para.length || quote.length || (list && list.type !== kind)) flush();
      if (!list) list = { type: kind, items: [] };
      list.items.push(text);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(trimmed);
    if (q) {
      if (para.length || list) flush();
      quote.push(q[1]);
      continue;
    }
    if (list && /^\s{2,}/.test(raw)) {
      // continuation of the previous list item
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }
    if (list || quote.length) flush();
    para.push(trimmed);
  }
  flush();
  return blocks;
}

function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https:\/\/|mailto:)/i.test(h) ? h : null;
}

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let i = 0;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="rounded bg-page px-1 py-0.5 text-[0.92em]">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (m[2]) {
      out.push(<strong key={key}>{renderInline(tok.slice(2, -2), key)}</strong>);
    } else if (m[3] || m[4]) {
      out.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = link ? safeHref(link[2]) : null;
      if (link && href) {
        out.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-dark font-semibold underline underline-offset-2"
          >
            {link[1]}
          </a>
        );
      } else {
        out.push(link ? link[1] : tok);
      }
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export default function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-2 break-words">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.type) {
          case "h":
            if (b.level === 1) return <h2 key={k} className="text-[18px] font-bold text-ink mt-2">{renderInline(b.text, k)}</h2>;
            if (b.level === 2) return <h3 key={k} className="text-[15.5px] font-bold text-ink mt-2">{renderInline(b.text, k)}</h3>;
            return <h4 key={k} className="text-[14px] font-bold text-ink mt-1">{renderInline(b.text, k)}</h4>;
          case "p":
            return <p key={k}>{renderInline(b.text, k)}</p>;
          case "ul":
            return (
              <ul key={k} className="list-disc pl-5 flex flex-col gap-1">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${k}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={k} className="list-decimal pl-5 flex flex-col gap-1">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `${k}-${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={k} className="border-l-4 border-brand/40 pl-3 italic text-ink-2">
                {renderInline(b.text, k)}
              </blockquote>
            );
          case "hr":
            return <hr key={k} className="border-border" />;
        }
      })}
    </div>
  );
}
