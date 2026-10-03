import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { knowledge as s } from "@/lib/nrs/i18n/en/knowledge";
import NrsState from "../../../_components/NrsState";
import { gatePage } from "../../../_home/gate";
import Markdown from "../../../_home/Markdown";
import { isUuid } from "../../../_home/server";
import { Card, Pill, fill, fmtDate, linkClass } from "../../../_home/ui";
import { loadLibrary } from "../../_lib";
import AckButton from "./AckButton";

export default async function NrSynergyDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await gatePage("knowledge");
  if (!gate.ok) return gate.node;
  const { ctx, member } = gate;
  const { id } = await params;

  const back = (
    <Link href="/tools/nr-synergy/knowledge" className={`${linkClass} text-[12.5px] self-start`}>
      ← {s.back}
    </Link>
  );
  if (!isUuid(id)) {
    return (
      <div className="flex flex-col">
        {back}
        <NrsState icon="book" title={s.docNotFound} />
      </div>
    );
  }

  const supabase = await createClient();
  const [doc] = await loadLibrary(supabase, ctx, member, { documentId: id, withBody: true });
  if (!doc) {
    return (
      <div className="flex flex-col">
        {back}
        <NrsState icon="book" title={s.docNotFound} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {back}
      <Card as="article" labelledBy="nrs-doc-title" className="flex flex-col gap-4 max-w-[860px]">
        <header className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Pill tone="brand">{s.category[doc.category]}</Pill>
            <Pill>{doc.country_code ?? s.global}</Pill>
          </div>
          <h1 id="nrs-doc-title" className="text-[20px] sm:text-[24px] font-bold text-ink tracking-tight break-words">
            {doc.title}
          </h1>
          <p className="text-[12px] text-ink-muted">
            {fill(s.version, { version: doc.version.version })} · {fill(s.effective, { date: fmtDate(doc.version.effective_from) })}
          </p>
          {doc.version.summary && <p className="text-[13px] text-ink-2">{doc.version.summary}</p>}
        </header>

        {doc.version.body_markdown?.trim() ? (
          <Markdown source={doc.version.body_markdown} />
        ) : (
          <p className="text-[13px] text-ink-muted">{s.noBody}</p>
        )}

        {doc.requires_ack && (
          <footer className="border-t border-border pt-4">
            {doc.ackedAt ? (
              <p className="text-[12.5px] text-good-text font-bold">{fill(s.ackedOn, { date: fmtDate(doc.ackedAt) })}</p>
            ) : (
              <AckButton versionId={doc.version.id} />
            )}
          </footer>
        )}
      </Card>
    </div>
  );
}
