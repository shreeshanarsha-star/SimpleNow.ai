import Link from "next/link";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import { knowledge as s } from "@/lib/nrs/i18n/en/knowledge";
import { gatePage } from "../_home/gate";
import { Card, EmptyLine, PageHeader, Pill, SectionTitle, fill, fmtDate } from "../_home/ui";
import { DOC_CATEGORIES, loadLibrary, type LibraryDoc } from "./_lib";

interface QuickLink {
  id: string;
  title: string;
  url: string;
  description: string | null;
}

export default async function NrSynergyKnowledgePage() {
  const gate = await gatePage("knowledge");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const supabase = await createClient();

  const [docs, linksRes] = await Promise.all([
    loadLibrary(supabase, ctx, member),
    supabase
      .from("nrs_quick_links")
      .select("id, title, url, description")
      .eq("org_id", member.org_id)
      .order("sort", { ascending: true })
      .order("title", { ascending: true }),
  ]);
  if (linksRes.error) throw new Error(linksRes.error.message);
  const links = ((linksRes.data ?? []) as QuickLink[]).filter((l) => /^https:\/\//i.test(l.url));

  const grouped = DOC_CATEGORIES.map((c) => ({ category: c, docs: docs.filter((d) => d.category === c) })).filter(
    (g) => g.docs.length > 0
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={s.title} subtitle={s.subtitle} />

      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-wash">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-full bg-surface text-brand flex items-center justify-center">
            <Icon name="award" className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-ink">{s.joe.title}</h2>
            <p className="text-[12.5px] text-ink-2">{s.joe.card}</p>
          </div>
        </div>
        <Link
          href="/tools/nr-synergy/knowledge/joe"
          className="self-start sm:self-center bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm shadow-soft-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {s.joe.open}
        </Link>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card labelledBy="nrs-library">
          <SectionTitle id="nrs-library">{s.library}</SectionTitle>
          {grouped.length === 0 ? (
            <EmptyLine>{s.libraryEmpty}</EmptyLine>
          ) : (
            <div className="flex flex-col gap-4">
              {grouped.map((g) => (
                <section key={g.category} aria-labelledby={`nrs-cat-${g.category}`}>
                  <h3 id={`nrs-cat-${g.category}`} className="text-[11.5px] font-bold uppercase tracking-wide text-ink-muted mb-1.5">
                    {s.category[g.category]}
                  </h3>
                  <ul className="flex flex-col divide-y divide-border border border-border rounded-sm">
                    {g.docs.map((d) => (
                      <DocRowItem key={d.id} doc={d} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>

        <Card labelledBy="nrs-links" className="self-start">
          <SectionTitle id="nrs-links">{s.quickLinks}</SectionTitle>
          {links.length === 0 ? (
            <EmptyLine>{s.quickLinksEmpty}</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-1">
              {links.map((l) => (
                <li key={l.id}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-sm px-2 py-2 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Icon name="share" className="w-4 h-4 mt-0.5 shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-bold text-ink break-words">{l.title}</span>
                      {l.description && <span className="block text-[12px] text-ink-muted break-words">{l.description}</span>}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function DocRowItem({ doc }: { doc: LibraryDoc }) {
  return (
    <li>
      <Link
        href={`/tools/nr-synergy/knowledge/doc/${doc.id}`}
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-ink break-words">{doc.title}</span>
          <span className="block text-[11.5px] text-ink-muted">
            {fill(s.version, { version: doc.version.version })} · {fill(s.effective, { date: fmtDate(doc.version.effective_from) })}
            {" · "}
            {doc.country_code ?? s.global}
          </span>
        </span>
        {doc.requires_ack && (doc.ackedAt ? <Pill tone="good">{s.acked}</Pill> : <Pill tone="warning">{s.needsAck}</Pill>)}
      </Link>
    </li>
  );
}
